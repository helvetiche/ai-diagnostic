mod acpi;
mod cpu;
mod gpu;
mod pawnio;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::resources::ResourceState;

const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);
const HISTORY_LIMIT: usize = 300;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermalReading {
    pub label: String,
    pub celsius: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorInfo {
    pub id: String,
    pub label: String,
    pub method: String,
    pub method_label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuThermal {
    pub name: String,
    pub vendor: String,
    pub package: Option<ThermalReading>,
    pub hottest_core: Option<ThermalReading>,
    pub cores: Vec<ThermalReading>,
    pub sensor: SensorInfo,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuThermal {
    pub name: String,
    pub celsius: Option<f64>,
    pub sensor: SensorInfo,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PawnIoStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub module: Option<String>,
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermalSample {
    pub sampled_at: u64,
    pub cpu: CpuThermal,
    pub gpus: Vec<GpuThermal>,
    pub pawnio: PawnIoStatus,
}

pub struct ThermalState {
    history: Mutex<Vec<ThermalSample>>,
    recheck: AtomicBool,
}

impl ThermalState {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(Vec::with_capacity(HISTORY_LIMIT)),
            recheck: AtomicBool::new(false),
        }
    }

    fn lock_history(&self) -> MutexGuard<'_, Vec<ThermalSample>> {
        self.history
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

struct Engine {
    cpu: cpu::CpuEngine,
    gpu: gpu::GpuEngine,
    pawnio: PawnIoStatus,
}

impl Engine {
    fn detect() -> Self {
        let detection = cpu::detect();
        Self {
            cpu: detection.engine,
            gpu: gpu::GpuEngine::detect(),
            pawnio: detection.pawnio,
        }
    }

    fn sample(&mut self) -> ThermalSample {
        ThermalSample {
            sampled_at: now_ms(),
            cpu: self.cpu.read(),
            gpus: self.gpu.read(),
            pawnio: self.pawnio.clone(),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

pub fn spawn_sampler(app: AppHandle, state: Arc<ThermalState>, resources: Arc<ResourceState>) {
    thread::spawn(move || {
        let mut engine = Engine::detect();

        loop {
            if state.recheck.swap(false, Ordering::AcqRel) {
                state.lock_history().clear();
                engine = Engine::detect();
            }

            if resources.is_streaming() {
                let sample = engine.sample();

                {
                    let mut history = state.lock_history();
                    if history.len() >= HISTORY_LIMIT {
                        history.remove(0);
                    }
                    history.push(sample.clone());
                }

                let _ = app.emit("thermal:sample", &sample);
            }

            thread::sleep(SAMPLE_INTERVAL);
        }
    });
}

#[tauri::command]
pub fn thermal_history(state: State<'_, Arc<ThermalState>>) -> Vec<ThermalSample> {
    state.lock_history().clone()
}

#[tauri::command]
pub fn recheck_thermals(state: State<'_, Arc<ThermalState>>) {
    state.recheck.store(true, Ordering::Release);
}
