use std::ffi::c_void;
use std::mem::size_of;

use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::Deserialize;
use wmi::WMIConnection;
use windows::core::{w, PCSTR};
use windows::Win32::Foundation::{FreeLibrary, HMODULE};
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32,
};

use crate::thermal::{GpuThermal, SensorInfo};

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct VideoController {
    name: Option<String>,
    #[serde(rename = "PNPDeviceID")]
    pnp_device_id: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Other,
}

enum GpuSource {
    Nvidia(usize),
    Amd(usize),
    None(GpuVendor),
}

struct GpuAdapter {
    name: String,
    source: GpuSource,
}

pub struct GpuEngine {
    adapters: Vec<GpuAdapter>,
    nvml: Option<Nvml>,
    adl: Option<Adl>,
}

impl GpuEngine {
    pub fn detect() -> Self {
        let rows = query_video_controllers();
        let nvml = Nvml::init().ok();
        let nvml_names = nvml
            .as_ref()
            .map(|nvml| {
                (0..nvml.device_count().unwrap_or(0))
                    .filter_map(|index| nvml.device_by_index(index).ok()?.name().ok())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let has_amd = rows.iter().any(|(name, pnp)| vendor_for(name, pnp) == GpuVendor::Amd);
        let adl = if has_amd || rows.is_empty() {
            Adl::load()
        } else {
            None
        };
        let adl_names = adl
            .as_ref()
            .map(|adl| {
                adl.adapters
                    .iter()
                    .map(|adapter| adapter.name.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let mut adapters = Vec::new();

        if rows.is_empty() {
            for name in &nvml_names {
                let index = adapters.len();
                adapters.push(GpuAdapter {
                    name: name.clone(),
                    source: GpuSource::Nvidia(index),
                });
            }
            for name in &adl_names {
                let index = adapters.len() - nvml_names.len();
                adapters.push(GpuAdapter {
                    name: name.clone(),
                    source: GpuSource::Amd(index),
                });
            }
        } else {
            let mut used_nvml = vec![false; nvml_names.len()];
            let mut used_adl = vec![false; adl_names.len()];

            for (name, pnp) in rows {
                let vendor = vendor_for(&name, &pnp);
                let source = match vendor {
                    GpuVendor::Nvidia => take_match(&nvml_names, &mut used_nvml, &name)
                        .map(GpuSource::Nvidia)
                        .unwrap_or(GpuSource::None(vendor)),
                    GpuVendor::Amd => take_match(&adl_names, &mut used_adl, &name)
                        .map(GpuSource::Amd)
                        .unwrap_or(GpuSource::None(vendor)),
                    _ => GpuSource::None(vendor),
                };

                adapters.push(GpuAdapter { name, source });
            }
        }

        Self {
            adapters,
            nvml,
            adl,
        }
    }

    pub fn read(&self) -> Vec<GpuThermal> {
        self.adapters
            .iter()
            .map(|adapter| {
                let celsius = match adapter.source {
                    GpuSource::Nvidia(index) => self
                        .nvml
                        .as_ref()
                        .and_then(|nvml| nvml.device_by_index(index as u32).ok())
                        .and_then(|device| device.temperature(TemperatureSensor::Gpu).ok())
                        .map(|value| value as f64),
                    GpuSource::Amd(index) => self
                        .adl
                        .as_ref()
                        .and_then(|adl| adl.temperature(index)),
                    GpuSource::None(_) => None,
                };

                GpuThermal {
                    name: adapter.name.clone(),
                    celsius,
                    sensor: sensor_for(&adapter.source, celsius.is_some()),
                }
            })
            .collect()
    }
}

fn sensor_for(source: &GpuSource, live: bool) -> SensorInfo {
    let (method, method_label, detail) = match source {
        GpuSource::Nvidia(_) => (
            "nvml",
            "NVIDIA NVML",
            "GPU temperature read from the NVIDIA driver through NVML.",
        ),
        GpuSource::Amd(_) => (
            "adl",
            "AMD ADL",
            "GPU edge temperature read from the AMD Display Library.",
        ),
        GpuSource::None(GpuVendor::Intel) => (
            "unavailable",
            "Not exposed by driver",
            "Intel graphics drivers do not expose a supported temperature sensor to this app.",
        ),
        GpuSource::None(GpuVendor::Amd) => (
            "unavailable",
            "AMD ADL unavailable",
            "The AMD Display Library could not read a temperature sensor for this adapter.",
        ),
        GpuSource::None(_) => (
            "unavailable",
            "No supported sensor",
            "This adapter does not expose a temperature sensor through a supported API.",
        ),
    };

    SensorInfo {
        id: "gpu".to_string(),
        label: "GPU temperature".to_string(),
        method: method.to_string(),
        method_label: method_label.to_string(),
        status: if live { "live" } else { "unavailable" }.to_string(),
        detail: detail.to_string(),
    }
}

fn vendor_for(name: &str, pnp: &str) -> GpuVendor {
    let pnp = pnp.to_ascii_uppercase();

    if pnp.contains("VEN_10DE") || name.to_ascii_lowercase().contains("nvidia") {
        GpuVendor::Nvidia
    } else if pnp.contains("VEN_1002")
        || name.to_ascii_lowercase().contains("amd")
        || name.to_ascii_lowercase().contains("radeon")
    {
        GpuVendor::Amd
    } else if pnp.contains("VEN_8086") || name.to_ascii_lowercase().contains("intel") {
        GpuVendor::Intel
    } else {
        GpuVendor::Other
    }
}

fn take_match(candidates: &[String], used: &mut [bool], name: &str) -> Option<usize> {
    let target = name.to_ascii_lowercase();

    let exact = candidates.iter().enumerate().find(|(index, candidate)| {
        !used[*index] && {
            let candidate = candidate.to_ascii_lowercase();
            candidate == target || candidate.contains(&target) || target.contains(&candidate)
        }
    });

    let chosen = exact.or_else(|| {
        candidates
            .iter()
            .enumerate()
            .find(|(index, _)| !used[*index])
    });

    chosen.map(|(index, _)| {
        used[index] = true;
        index
    })
}

fn query_video_controllers() -> Vec<(String, String)> {
    let Ok(connection) = WMIConnection::with_namespace_path("root\\CIMV2") else {
        return Vec::new();
    };

    let rows: Vec<VideoController> = connection
        .raw_query("SELECT Name, PNPDeviceID FROM Win32_VideoController")
        .unwrap_or_default();

    rows.into_iter()
        .filter_map(|row| {
            let name = row.name?;

            if name.trim().is_empty() {
                return None;
            }

            Some((name, row.pnp_device_id.unwrap_or_default()))
        })
        .collect()
}

type MainControlCreate =
    unsafe extern "C" fn(Option<unsafe extern "C" fn(i32) -> *mut c_void>, i32, *mut *mut c_void) -> i32;
type MainControlDestroy = unsafe extern "C" fn(*mut c_void) -> i32;
type AdapterNumberGet = unsafe extern "C" fn(*mut c_void, *mut i32) -> i32;
type AdapterInfoGet = unsafe extern "C" fn(*mut c_void, *mut AdlAdapterInfo, i32) -> i32;
type OverdriveNTemperatureGet =
    unsafe extern "C" fn(*mut c_void, i32, i32, *mut i32) -> i32;
type Overdrive5TemperatureGet =
    unsafe extern "C" fn(*mut c_void, i32, i32, *mut AdlTemperature) -> i32;

struct AdlFns {
    destroy: MainControlDestroy,
    overdrive_n: Option<OverdriveNTemperatureGet>,
    overdrive_5: Option<Overdrive5TemperatureGet>,
}

struct Adl {
    module: HMODULE,
    context: *mut c_void,
    functions: AdlFns,
    adapters: Vec<AdlAdapter>,
}

struct AdlAdapter {
    index: i32,
    name: String,
}

impl Adl {
    fn load() -> Option<Self> {
        unsafe {
            let module = LoadLibraryExW(w!("atiadlxx.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32)
                .ok()?;

            let create = resolve::<MainControlCreate>(module, b"ADL2_Main_Control_Create\0");
            let destroy = resolve::<MainControlDestroy>(module, b"ADL2_Main_Control_Destroy\0");
            let adapter_number =
                resolve::<AdapterNumberGet>(module, b"ADL2_Adapter_NumberOfAdapters_Get\0");
            let adapter_info =
                resolve::<AdapterInfoGet>(module, b"ADL2_Adapter_AdapterInfo_Get\0");

            let (Some(create), Some(destroy), Some(adapter_number), Some(adapter_info)) =
                (create, destroy, adapter_number, adapter_info)
            else {
                let _ = FreeLibrary(module);
                return None;
            };

            let mut context: *mut c_void = std::ptr::null_mut();
            let status = create(Some(adl_alloc), 1, &mut context);

            if status != 0 || context.is_null() {
                let _ = FreeLibrary(module);
                return None;
            }

            let mut count = 0i32;
            if adapter_number(context, &mut count) != 0 || count <= 0 {
                let _ = destroy(context);
                let _ = FreeLibrary(module);
                return None;
            }

            let mut info = vec![AdlAdapterInfo::default(); count as usize];
            let byte_size = (count as usize * size_of::<AdlAdapterInfo>()) as i32;

            if adapter_info(context, info.as_mut_ptr(), byte_size) != 0 {
                let _ = destroy(context);
                let _ = FreeLibrary(module);
                return None;
            }

            let mut adapters = Vec::new();
            let mut seen = Vec::new();

            for adapter in info {
                let udid = ansi_string(&adapter.udid);
                let name = ansi_string(&adapter.adapter_name);

                if name.trim().is_empty() || adapter.present == 0 {
                    continue;
                }

                let is_amd = udid.to_ascii_uppercase().contains("VEN_1002")
                    || name.to_ascii_lowercase().contains("amd")
                    || name.to_ascii_lowercase().contains("radeon");

                if !is_amd {
                    continue;
                }

                let key = (adapter.bus_number, adapter.device_number);
                if seen.contains(&key) {
                    continue;
                }
                seen.push(key);

                adapters.push(AdlAdapter {
                    index: adapter.adapter_index,
                    name,
                });
            }

            let overdrive_n =
                resolve::<OverdriveNTemperatureGet>(module, b"ADL2_OverdriveN_Temperature_Get\0");
            let overdrive_5 =
                resolve::<Overdrive5TemperatureGet>(module, b"ADL2_Overdrive5_Temperature_Get\0");

            Some(Self {
                module,
                context,
                functions: AdlFns {
                    destroy,
                    overdrive_n,
                    overdrive_5,
                },
                adapters,
            })
        }
    }

    fn temperature(&self, index: usize) -> Option<f64> {
        let adapter = self.adapters.get(index)?;

        if let Some(read) = self.functions.overdrive_n {
            let mut raw = 0i32;

            if unsafe { read(self.context, adapter.index, 1, &mut raw) } == 0 {
                let celsius = raw as f64 / 1000.0;

                if (0.0..=125.0).contains(&celsius) {
                    return Some(celsius);
                }
            }
        }

        if let Some(read) = self.functions.overdrive_5 {
            let mut value = AdlTemperature {
                size: size_of::<AdlTemperature>() as i32,
                temperature: 0,
            };

            if unsafe { read(self.context, adapter.index, 0, &mut value) } == 0 {
                let celsius = value.temperature as f64 / 1000.0;

                if (0.0..=125.0).contains(&celsius) {
                    return Some(celsius);
                }
            }
        }

        None
    }
}

impl Drop for Adl {
    fn drop(&mut self) {
        unsafe {
            let _ = (self.functions.destroy)(self.context);
            let _ = FreeLibrary(self.module);
        }
    }
}

unsafe fn resolve<T: Copy>(module: HMODULE, name: &'static [u8]) -> Option<T> {
    let address = unsafe { GetProcAddress(module, PCSTR(name.as_ptr())) }?;

    if size_of::<T>() != size_of::<usize>() {
        return None;
    }

    Some(unsafe { std::mem::transmute_copy::<_, T>(&address) })
}

unsafe extern "C" fn adl_alloc(size: i32) -> *mut c_void {
    unsafe { libc::malloc(size.max(1) as usize) }
}

const ADL_MAX_PATH: usize = 256;

#[repr(C)]
#[derive(Clone, Copy)]
struct AdlAdapterInfo {
    size: i32,
    adapter_index: i32,
    udid: [u8; ADL_MAX_PATH],
    bus_number: i32,
    device_number: i32,
    function_number: i32,
    vendor_id: i32,
    adapter_name: [u8; ADL_MAX_PATH],
    display_name: [u8; ADL_MAX_PATH],
    present: i32,
    exist: i32,
    driver_path: [u8; ADL_MAX_PATH],
    driver_path_ext: [u8; ADL_MAX_PATH],
    pnp_string: [u8; ADL_MAX_PATH],
    os_display_index: i32,
}

const _: () = assert!(size_of::<AdlAdapterInfo>() == 1572);

impl Default for AdlAdapterInfo {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

#[repr(C)]
struct AdlTemperature {
    size: i32,
    temperature: i32,
}

fn ansi_string(value: &[u8]) -> String {
    let length = value.iter().position(|byte| *byte == 0).unwrap_or(value.len());
    String::from_utf8_lossy(&value[..length]).trim().to_string()
}
