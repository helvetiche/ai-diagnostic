use std::mem::size_of;

use sysinfo::System;
use windows::core::w;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::System::SystemInformation::{
    GetLogicalProcessorInformationEx, RelationProcessorCore, GROUP_AFFINITY,
    LOGICAL_PROCESSOR_RELATIONSHIP, PROCESSOR_RELATIONSHIP,
};
use windows::Win32::System::Threading::{
    CreateMutexW, GetCurrentThread, GetThreadGroupAffinity, ReleaseMutex, SetThreadGroupAffinity,
    WaitForSingleObject,
};

use crate::thermal::acpi::{self, AcpiZone};
use crate::thermal::pawnio::{self, PawnIo};
use crate::thermal::{CpuThermal, PawnIoStatus, SensorInfo, ThermalReading};

const INTEL_TEMPERATURE_TARGET: u32 = 0x1A2;
const INTEL_PACKAGE_THERM_STATUS: u32 = 0x1B1;
const INTEL_THERM_STATUS: u32 = 0x19C;
const AMD_THM_TCON_CUR_TMP: u32 = 0x0005_9800;

pub struct CpuDetection {
    pub engine: CpuEngine,
    pub pawnio: PawnIoStatus,
}

pub enum CpuEngine {
    Intel(Intel),
    Amd(Amd),
    Acpi(Acpi),
}

impl CpuEngine {
    pub fn read(&mut self) -> CpuThermal {
        match self {
            Self::Intel(cpu) => cpu.read(),
            Self::Amd(cpu) => cpu.read(),
            Self::Acpi(cpu) => cpu.read(),
        }
    }
}

pub fn detect() -> CpuDetection {
    let mut system = System::new().expect("failed to create system");
    system.refresh_cpu_all();

    let first = system.cpus().first();
    let mut name = first.map(|cpu| cpu.brand().to_string()).unwrap_or_default();
    let mut vendor = first.map(|cpu| cpu.vendor_id().to_string()).unwrap_or_default();

    if vendor.is_empty() {
        if name.contains("AMD") {
            vendor = "AuthenticAMD".to_string();
        } else if name.contains("Intel") {
            vendor = "GenuineIntel".to_string();
        }
    }

    if name.trim().is_empty() {
        name = "Unknown CPU".to_string();
    }

    let version = pawnio::installed_version();
    let mut module = None;

    let engine = if vendor == "GenuineIntel" {
        match PawnIo::load(pawnio::INTEL_MODULE) {
            Ok(reader) => {
                module = Some("IntelMSR.bin".to_string());
                CpuEngine::Intel(Intel::new(reader, name.clone()))
            }
            Err(error) => CpuEngine::Acpi(Acpi::new(
                name.clone(),
                vendor.clone(),
                Some(error.to_string()),
            )),
        }
    } else if vendor == "AuthenticAMD" {
        match PawnIo::load(pawnio::AMD_MODULE) {
            Ok(reader) => {
                module = Some("AMDFamily17.bin".to_string());
                CpuEngine::Amd(Amd::new(reader, name.clone()))
            }
            Err(error) => CpuEngine::Acpi(Acpi::new(
                name.clone(),
                vendor.clone(),
                Some(error.to_string()),
            )),
        }
    } else {
        CpuEngine::Acpi(Acpi::new(
            name.clone(),
            vendor.clone(),
            Some("This CPU vendor has no supported deep sensor module.".to_string()),
        ))
    };

    let detail = if module.is_some() {
        match version.as_deref() {
            Some(version) => format!("PawnIO {version} is active. Signed sensor module loaded."),
            None => "PawnIO is active. Signed sensor module loaded.".to_string(),
        }
    } else if version.is_some() {
        "PawnIO is installed, but the signed sensor module could not be loaded. Using the ACPI fallback."
            .to_string()
    } else {
        "PawnIO is not installed. CPU temperature uses ACPI thermal zones. Install PawnIO for package and core sensors."
            .to_string()
    };

    CpuDetection {
        engine,
        pawnio: PawnIoStatus {
            installed: version.is_some() || module.is_some(),
            version,
            module,
            detail,
        },
    }
}

pub(super) struct Intel {
    reader: PawnIo,
    name: String,
    tj_max: f64,
    cores: Vec<GROUP_AFFINITY>,
}

impl Intel {
    fn new(reader: PawnIo, name: String) -> Self {
        let tj_max = reader
            .read_msr(INTEL_TEMPERATURE_TARGET)
            .map(|value| ((value >> 16) & 0xFF) as f64)
            .filter(|value| (70.0..=120.0).contains(value))
            .unwrap_or(100.0);

        Self {
            reader,
            name,
            tj_max,
            cores: physical_core_affinities(),
        }
    }

    fn read(&mut self) -> CpuThermal {
        let package = self
            .reader
            .read_msr(INTEL_PACKAGE_THERM_STATUS)
            .and_then(|value| intel_temperature(value, self.tj_max));

        let mut cores = Vec::new();
        for (index, affinity) in self.cores.iter().enumerate() {
            let raw = with_affinity(*affinity, || self.reader.read_msr(INTEL_THERM_STATUS));

            if let Some(Some(raw)) = raw {
                if let Some(celsius) = intel_temperature(raw, self.tj_max) {
                    cores.push(ThermalReading {
                        label: format!("Core {}", index + 1),
                        celsius,
                    });
                }
            }
        }

        let hottest_core = cores.iter().cloned().max_by(|left, right| {
            left.celsius
                .partial_cmp(&right.celsius)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let package = package.map(|celsius| ThermalReading {
            label: "CPU package".to_string(),
            celsius,
        });
        let status = if package.is_some() || !cores.is_empty() {
            "live"
        } else {
            "unavailable"
        };

        CpuThermal {
            name: self.name.clone(),
            vendor: "GenuineIntel".to_string(),
            package,
            hottest_core,
            cores,
            sensor: SensorInfo {
                id: "cpu".to_string(),
                label: "CPU package".to_string(),
                method: "intel-msr".to_string(),
                method_label: "Intel MSR".to_string(),
                status: status.to_string(),
                detail: format!(
                    "TjMax {:.0} °C. Package and per-core digital thermal sensors read through PawnIO.",
                    self.tj_max
                ),
            },
        }
    }
}

fn intel_temperature(value: u64, tj_max: f64) -> Option<f64> {
    if value & 0x8000_0000 == 0 {
        return None;
    }

    let celsius = tj_max - ((value >> 16) & 0x7F) as f64;
    (0.0..=125.0).contains(&celsius).then_some(celsius)
}

pub(super) struct Amd {
    reader: PawnIo,
    name: String,
    mutex: Option<HANDLE>,
}

impl Amd {
    fn new(reader: PawnIo, name: String) -> Self {
        let mutex = unsafe { CreateMutexW(None, false, w!(r"\BaseNamedObjects\Access_PCI")) }.ok();

        Self {
            reader,
            name,
            mutex,
        }
    }

    fn read(&mut self) -> CpuThermal {
        let raw = self.with_pci(|| self.reader.read_smn(AMD_THM_TCON_CUR_TMP)).flatten();

        let mut package = None;
        let mut extra = Vec::new();

        if let Some(raw) = raw {
            let offset_flag = raw & 0x0008_0000 != 0 || raw & 0x0003_0000 == 0x0003_0000;
            let mut tctl = ((raw >> 21) as f64) * 0.125;

            if offset_flag {
                tctl -= 49.0;
            }

            if (0.0..=125.0).contains(&tctl) {
                let offset = amd_name_offset(&self.name);

                if offset < 0.0 {
                    package = Some(ThermalReading {
                        label: "Tdie".to_string(),
                        celsius: tctl + offset,
                    });
                    extra.push(ThermalReading {
                        label: "Tctl".to_string(),
                        celsius: tctl,
                    });
                } else {
                    package = Some(ThermalReading {
                        label: "Tctl/Tdie".to_string(),
                        celsius: tctl,
                    });
                }
            }
        }

        let status = if package.is_some() { "live" } else { "unavailable" };

        CpuThermal {
            name: self.name.clone(),
            vendor: "AuthenticAMD".to_string(),
            package,
            hottest_core: None,
            cores: extra,
            sensor: SensorInfo {
                id: "cpu".to_string(),
                label: "CPU Tctl/Tdie".to_string(),
                method: "amd-smn".to_string(),
                method_label: "AMD SMN".to_string(),
                status: status.to_string(),
                detail: "Tctl/Tdie read from SMN 0x00059800 through PawnIO. Per-core temperatures are not exposed on this platform."
                    .to_string(),
            },
        }
    }

    fn with_pci<T>(&self, action: impl FnOnce() -> T) -> Option<T> {
        let Some(mutex) = self.mutex else {
            return Some(action());
        };

        let wait = unsafe { WaitForSingleObject(mutex, 1_000) };

        if wait != WAIT_OBJECT_0 {
            return None;
        }

        let result = action();
        unsafe {
            let _ = ReleaseMutex(mutex);
        }
        Some(result)
    }
}

impl Drop for Amd {
    fn drop(&mut self) {
        if let Some(mutex) = self.mutex {
            unsafe {
                let _ = CloseHandle(mutex);
            }
        }
    }
}

fn amd_name_offset(name: &str) -> f64 {
    if name.contains("1600X") || name.contains("1700X") || name.contains("1800X") {
        -20.0
    } else if name.contains("Threadripper 19") || name.contains("Threadripper 29") {
        -27.0
    } else if name.contains("2700X") {
        -10.0
    } else {
        0.0
    }
}

pub(super) struct Acpi {
    name: String,
    vendor: String,
    reason: Option<String>,
    zone: Option<AcpiZone>,
}

impl Acpi {
    fn new(name: String, vendor: String, reason: Option<String>) -> Self {
        Self {
            name,
            vendor,
            reason,
            zone: acpi::open_connection().map(AcpiZone::new),
        }
    }

    fn read(&mut self) -> CpuThermal {
        let reading = self.zone.as_ref().and_then(AcpiZone::read);
        let zone_name = reading.as_ref().map(|(_, name)| name.clone());
        let celsius = reading.map(|(celsius, _)| celsius);

        let reason = self
            .reason
            .clone()
            .unwrap_or_else(|| "Deep CPU sensors are unavailable.".to_string());

        let detail = match zone_name {
            Some(zone) => format!(
                "{reason} Showing ACPI zone {zone}, which may track the motherboard rather than the CPU die."
            ),
            None => format!("{reason} No readable ACPI thermal zone was found."),
        };

        let status = if celsius.is_some() {
            "fallback"
        } else {
            "unavailable"
        };

        CpuThermal {
            name: self.name.clone(),
            vendor: self.vendor.clone(),
            package: celsius.map(|celsius| ThermalReading {
                label: "ACPI thermal zone".to_string(),
                celsius,
            }),
            hottest_core: None,
            cores: Vec::new(),
            sensor: SensorInfo {
                id: "cpu".to_string(),
                label: "CPU thermal zone".to_string(),
                method: "acpi-zone".to_string(),
                method_label: "ACPI thermal zone".to_string(),
                status: status.to_string(),
                detail,
            },
        }
    }
}

#[repr(C)]
struct RelationshipHeader {
    relationship: LOGICAL_PROCESSOR_RELATIONSHIP,
    size: u32,
}

fn physical_core_affinities() -> Vec<GROUP_AFFINITY> {
    unsafe {
        let mut length = 0u32;
        let _ = GetLogicalProcessorInformationEx(RelationProcessorCore, None, &mut length);

        if length == 0 {
            return Vec::new();
        }

        let mut buffer = vec![0u8; length as usize];
        let buffer_ptr = buffer.as_mut_ptr() as *mut _;

        if GetLogicalProcessorInformationEx(RelationProcessorCore, Some(buffer_ptr), &mut length)
            .is_err()
        {
            return Vec::new();
        }

        let mut affinities = Vec::new();
        let mut offset = 0usize;
        let header_size = size_of::<RelationshipHeader>();

        while offset + header_size <= length as usize {
            let header = std::ptr::read_unaligned(
                buffer.as_ptr().add(offset) as *const RelationshipHeader
            );
            let entry_size = header.size as usize;

            if entry_size < header_size || offset + entry_size > length as usize {
                break;
            }

            if header.relationship == RelationProcessorCore
                && entry_size >= header_size + size_of::<PROCESSOR_RELATIONSHIP>()
            {
                let processor = std::ptr::read_unaligned(
                    buffer.as_ptr().add(offset + header_size) as *const PROCESSOR_RELATIONSHIP
                );

                if processor.GroupCount > 0 {
                    let mut affinity = processor.GroupMask[0];

                    if affinity.Mask != 0 {
                        affinity.Mask &= affinity.Mask.wrapping_neg();
                        affinities.push(affinity);
                    }
                }
            }

            offset += entry_size;
        }

        affinities
    }
}

fn with_affinity<T>(affinity: GROUP_AFFINITY, action: impl FnOnce() -> T) -> Option<T> {
    unsafe {
        let thread = GetCurrentThread();
        let mut previous = GROUP_AFFINITY::default();

        if !GetThreadGroupAffinity(thread, &mut previous).as_bool() {
            return None;
        }

        if !SetThreadGroupAffinity(thread, &affinity, None).as_bool() {
            return None;
        }

        let result = action();
        let _ = SetThreadGroupAffinity(thread, &previous, None);
        Some(result)
    }
}
