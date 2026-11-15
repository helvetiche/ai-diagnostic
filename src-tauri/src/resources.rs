use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::{Disks, Networks, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, State};
use wmi::WMIConnection;

use crate::network::NetworkCollector;

const SAMPLE_INTERVAL: Duration = Duration::from_secs(1);
const DISK_REFRESH_EVERY: u32 = 5;
const HISTORY_LIMIT: usize = 120;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSample {
    pub name: String,
    pub mount: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
    pub kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuSample {
    pub name: String,
    pub memory_total: u64,
    pub usage: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSample {
    pub sampled_at: u64,
    pub cpu: f32,
    pub cores: Vec<f32>,
    pub cpu_brand: String,
    pub cpu_frequency: u64,
    pub memory_used: u64,
    pub memory_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub download: u64,
    pub upload: u64,
    pub network_interfaces: Vec<String>,
    pub disk_read: u64,
    pub disk_write: u64,
    pub disks: Vec<DiskSample>,
    pub gpus: Vec<GpuSample>,
    pub battery_percent: Option<u8>,
    pub battery_charging: bool,
    pub has_battery: bool,
    pub uptime: u64,
    pub top_cpu: Vec<TopProcess>,
    pub top_memory: Vec<TopProcess>,
    pub top_gpu: Vec<TopProcess>,
    pub top_download: Vec<TopNetworkProcess>,
    pub top_upload: Vec<TopNetworkProcess>,
    pub network_attribution: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopNetworkProcess {
    pub name: String,
    pub rate: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProcess {
    pub name: String,
    pub cpu: f32,
    pub memory: u64,
    pub gpu: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSample {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory: u64,
    pub gpu: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListSample {
    pub sampled_at: u64,
    pub processes: Vec<ProcessSample>,
}

pub struct ResourceState {
    history: Mutex<Vec<ResourceSample>>,
    processes: Mutex<Vec<ProcessSample>>,
    streaming: AtomicBool,
}

impl ResourceState {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(Vec::with_capacity(HISTORY_LIMIT)),
            processes: Mutex::new(Vec::new()),
            streaming: AtomicBool::new(true),
        }
    }

    fn lock_history(&self) -> MutexGuard<'_, Vec<ResourceSample>> {
        self.history
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn lock_processes(&self) -> MutexGuard<'_, Vec<ProcessSample>> {
        self.processes
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn is_streaming(&self) -> bool {
        self.streaming.load(Ordering::Relaxed)
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn top_processes(
    processes: &[ProcessSample],
    metric: impl Fn(&TopProcess) -> f32,
    limit: usize,
) -> Vec<TopProcess> {
    let mut by_name: HashMap<String, TopProcess> = HashMap::new();

    for process in processes {
        let entry = by_name.entry(process.name.clone()).or_insert_with(|| TopProcess {
            name: process.name.clone(),
            cpu: 0.0,
            memory: 0,
            gpu: None,
        });

        entry.cpu = (entry.cpu + process.cpu).min(100.0);
        entry.memory = entry.memory.saturating_add(process.memory);
        if let Some(gpu) = process.gpu {
            entry.gpu = Some((entry.gpu.unwrap_or(0.0) + gpu).min(100.0));
        }
    }

    let mut ranked: Vec<TopProcess> = by_name
        .into_values()
        .filter(|process| metric(process) > 0.0)
        .collect();

    ranked.sort_by(|a, b| {
        metric(b)
            .partial_cmp(&metric(a))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    ranked.truncate(limit);
    ranked
}

fn top_network_processes(
    counters: &HashMap<u32, (u64, u64)>,
    names: &HashMap<u32, String>,
    received: bool,
    elapsed_ms: u64,
    limit: usize,
) -> Vec<TopNetworkProcess> {
    let mut by_name: HashMap<String, u64> = HashMap::new();

    for (pid, (download, upload)) in counters {
        let bytes = if received { *download } else { *upload };

        if bytes == 0 {
            continue;
        }

        let Some(name) = names.get(pid) else {
            continue;
        };

        let entry = by_name.entry(name.clone()).or_insert(0);
        *entry = entry.saturating_add(bytes);
    }

    let elapsed_ms = elapsed_ms.max(1);
    let mut ranked: Vec<TopNetworkProcess> = by_name
        .into_iter()
        .map(|(name, bytes)| TopNetworkProcess {
            name,
            rate: bytes.saturating_mul(1000) / elapsed_ms,
        })
        .filter(|process| process.rate > 0)
        .collect();

    ranked.sort_by(|a, b| b.rate.cmp(&a.rate));
    ranked.truncate(limit);
    ranked
}

fn network_totals(networks: &Networks) -> (u64, u64) {
    networks
        .values()
        .fold((0, 0), |(received, transmitted), data| {
            (
                received.saturating_add(data.total_received()),
                transmitted.saturating_add(data.total_transmitted()),
            )
        })
}

fn disk_samples(disks: &Disks) -> Vec<DiskSample> {
    disks
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .map(|disk| {
            let mount = disk.mount_point().to_string_lossy().into_owned();
            let name = disk.name().to_string_lossy().into_owned();
            DiskSample {
                name: if name.is_empty() {
                    mount.clone()
                } else {
                    name
                },
                mount,
                total: disk.total_space(),
                available: disk.available_space(),
                removable: disk.is_removable(),
                kind: match disk.kind() {
                    sysinfo::DiskKind::SSD => "SSD".to_string(),
                    sysinfo::DiskKind::HDD => "HDD".to_string(),
                    _ => "Unknown".to_string(),
                },
            }
        })
        .collect()
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct VideoController {
    name: Option<String>,
    #[serde(rename = "AdapterRAM")]
    adapter_ram: Option<u64>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct GpuEngine {
    name: Option<String>,
    utilization_percentage: Option<u64>,
}

#[repr(C)]
struct SystemPowerStatus {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
}

unsafe extern "system" {
    fn GetSystemPowerStatus(sps: *mut SystemPowerStatus) -> i32;
}

fn read_battery() -> (bool, Option<u8>, bool) {
    let mut sps = SystemPowerStatus {
        ac_line_status: 0,
        battery_flag: 0,
        battery_life_percent: 255,
        system_status_flag: 0,
        battery_life_time: 0,
        battery_full_life_time: 0,
    };

    let ok = unsafe { GetSystemPowerStatus(&mut sps) };
    if ok == 0 {
        return (false, None, false);
    }

    let has_battery = sps.battery_life_percent != 255;
    let percent = if has_battery {
        Some(sps.battery_life_percent)
    } else {
        None
    };
    let charging = sps.ac_line_status == 1;

    (has_battery, percent, charging)
}

fn query_gpus_static(wmi: &WMIConnection) -> Vec<GpuSample> {
    let rows: Vec<VideoController> = wmi
        .raw_query("SELECT Name, AdapterRAM FROM Win32_VideoController")
        .unwrap_or_default();

    rows.into_iter()
        .map(|row| GpuSample {
            name: row.name.unwrap_or_else(|| "Unknown GPU".to_string()),
            memory_total: row.adapter_ram.unwrap_or(0),
            usage: None,
        })
        .collect()
}

#[derive(Default)]
struct GpuEngineUsage {
    by_pid: HashMap<u32, f32>,
    total: Option<f32>,
}

fn gpu_engine_usage(wmi: &WMIConnection) -> GpuEngineUsage {
    let rows: Vec<GpuEngine> = wmi
        .raw_query(
            "SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
        )
        .unwrap_or_default();

    if rows.is_empty() {
        return GpuEngineUsage::default();
    }

    let mut usage = GpuEngineUsage {
        by_pid: HashMap::new(),
        total: Some(0.0),
    };
    let mut total = 0u64;

    for row in rows {
        let value = row.utilization_percentage.unwrap_or(0);
        total = total.saturating_add(value);

        // Instance name format: pid_1234_luid_..._eng_0_engtype_3D
        let pid = row
            .name
            .unwrap_or_default()
            .split('_')
            .nth(1)
            .and_then(|part| part.parse::<u32>().ok());

        if let Some(pid) = pid {
            let entry = usage.by_pid.entry(pid).or_insert(0.0);
            *entry = (*entry + value as f32).min(100.0);
        }
    }

    usage.total = Some((total as f32).min(100.0));
    usage
}

pub fn spawn_sampler(app: AppHandle, state: Arc<ResourceState>) {
    thread::spawn(move || {
        let mut system = System::new().expect("failed to create system");
        system.refresh_cpu_usage();
        system.refresh_memory();

        let mut disks = Disks::new_with_refreshed_list().expect("failed to list disks");
        let mut networks = Networks::new_with_refreshed_list().expect("failed to list networks");

        // Per-app network bytes come from the kernel ETW provider, which needs
        // administrator rights. Without it the charts still show interface rates.
        let network = NetworkCollector::start();

        // CPU usage is computed from two reads, so the first one needs a moment.
        thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);

        // WMI for GPU info. Best effort: if WMI fails, gpus stays empty.
        let wmi_conn = WMIConnection::new().ok();

        let static_gpus = wmi_conn
            .as_ref()
            .map(query_gpus_static)
            .unwrap_or_default();

        let mut last_network_totals = network_totals(&networks);
        let mut last_network_at = now_ms();

        let mut last_disk_read: u64 = 0;
        let mut last_disk_write: u64 = 0;
        let mut last_disk_at = now_ms();
        let mut current_disk_read: u64 = 0;
        let mut current_disk_write: u64 = 0;

        let mut tick: u32 = 0;

        loop {
            thread::sleep(SAMPLE_INTERVAL);

            if !state.streaming.load(Ordering::Relaxed) {
                networks.refresh(true);
                last_network_totals = network_totals(&networks);
                last_network_at = now_ms();
                if let Some(network) = network.as_ref() {
                    let _ = network.drain();
                }
                continue;
            }

            system.refresh_cpu_usage();
            system.refresh_memory();
            networks.refresh(true);
            system.refresh_processes(ProcessesToUpdate::All, true);

            tick = tick.wrapping_add(1);
            if tick % DISK_REFRESH_EVERY == 1 {
                disks.refresh(true);
                // Aggregate disk I/O across all processes.
                let (read, write) = system.processes().values().fold((0u64, 0u64), |(r, w), p| {
                    let d = p.disk_usage();
                    (r.saturating_add(d.read_bytes), w.saturating_add(d.written_bytes))
                });

                let sampled_at = now_ms();
                let elapsed_ms = sampled_at.saturating_sub(last_disk_at).max(1);
                current_disk_read = read.saturating_sub(last_disk_read) * 1000 / elapsed_ms;
                current_disk_write = write.saturating_sub(last_disk_write) * 1000 / elapsed_ms;
                last_disk_read = read;
                last_disk_write = write;
                last_disk_at = sampled_at;
            }

            // One process refresh per loop. A second refresh in the same loop
            // has no elapsed time to measure CPU against and reports zero.
            let gpu = wmi_conn
                .as_ref()
                .map(gpu_engine_usage)
                .unwrap_or_default();

            // sysinfo reports process CPU per logical core (a single fully busy
            // thread is 100%). Normalize to the whole machine so values line up
            // with total CPU and never exceed 100%, like Task Manager.
            let cpu_count = system.cpus().len().max(1) as f32;

            let mut procs: Vec<ProcessSample> = system
                .processes()
                .values()
                .map(|p| {
                    let pid = p.pid().to_string().parse::<u32>().unwrap_or(0);
                    ProcessSample {
                        pid,
                        name: p.name().to_string_lossy().into_owned(),
                        cpu: (p.cpu_usage() / cpu_count).min(100.0),
                        memory: p.memory(),
                        gpu: gpu.by_pid.get(&pid).copied(),
                    }
                })
                .collect();

            procs.sort_by(|a, b| {
                b.cpu
                    .partial_cmp(&a.cpu)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            {
                let mut lock = state.lock_processes();
                *lock = procs.clone();
            }

            let top_cpu = top_processes(&procs, |process| process.cpu, 3);
            let top_memory = top_processes(&procs, |process| process.memory as f32, 3);
            let top_gpu = top_processes(&procs, |process| process.gpu.unwrap_or(0.0), 3);

            let sampled_at = now_ms();
            let elapsed_ms = sampled_at.saturating_sub(last_network_at).max(1);
            let totals = network_totals(&networks);
            let download = totals.0.saturating_sub(last_network_totals.0) * 1000 / elapsed_ms;
            let upload = totals.1.saturating_sub(last_network_totals.1) * 1000 / elapsed_ms;

            last_network_totals = totals;
            last_network_at = sampled_at;

            let (top_download, top_upload, network_attribution) = match network.as_ref() {
                Some(network) if network.is_running() => {
                    let counters = network.drain();
                    let names: HashMap<u32, String> = procs
                        .iter()
                        .map(|process| (process.pid, process.name.clone()))
                        .collect();

                    (
                        top_network_processes(&counters, &names, true, elapsed_ms, 3),
                        top_network_processes(&counters, &names, false, elapsed_ms, 3),
                        true,
                    )
                }
                Some(network) => {
                    let _ = network.drain();
                    (Vec::new(), Vec::new(), false)
                }
                None => (Vec::new(), Vec::new(), false),
            };

            let process_sample = ProcessListSample {
                sampled_at,
                processes: procs,
            };
            let _ = app.emit("processes:sample", &process_sample);

            let mut gpus = static_gpus.clone();
            for adapter in gpus.iter_mut() {
                adapter.usage = gpu.total;
            }

            let (has_battery, battery_percent, battery_charging) = read_battery();

            let cpu_brand = system
                .cpus()
                .first()
                .map(|cpu| cpu.brand().to_string())
                .unwrap_or_default();
            let cpu_frequency = system.cpus().first().map(|cpu| cpu.frequency()).unwrap_or(0);

            let network_interfaces: Vec<String> =
                networks.keys().map(|name| name.to_string_lossy().into_owned()).collect();

            let sample = ResourceSample {
                sampled_at,
                cpu: system.global_cpu_usage(),
                cores: system.cpus().iter().map(|cpu| cpu.usage()).collect(),
                cpu_brand,
                cpu_frequency,
                memory_used: system.used_memory(),
                memory_total: system.total_memory(),
                swap_used: system.used_swap(),
                swap_total: system.total_swap(),
                download,
                upload,
                network_interfaces,
                disk_read: current_disk_read,
                disk_write: current_disk_write,
                disks: disk_samples(&disks),
                gpus,
                battery_percent,
                battery_charging,
                has_battery,
                uptime: System::uptime().unwrap_or(0),
                top_cpu,
                top_memory,
                top_gpu,
                top_download,
                top_upload,
                network_attribution,
            };

            {
                let mut history = state.lock_history();
                if history.len() >= HISTORY_LIMIT {
                    history.remove(0);
                }
                history.push(sample.clone());
            }

            let _ = app.emit("resource:sample", &sample);
        }
    });
}

#[tauri::command]
pub fn resource_history(state: State<'_, Arc<ResourceState>>) -> Vec<ResourceSample> {
    state.lock_history().clone()
}

#[tauri::command]
pub fn get_processes(state: State<'_, Arc<ResourceState>>) -> Vec<ProcessSample> {
    state.lock_processes().clone()
}

#[tauri::command]
pub fn set_resource_streaming(state: State<'_, Arc<ResourceState>>, streaming: bool) {
    state.streaming.store(streaming, Ordering::Relaxed);
}
