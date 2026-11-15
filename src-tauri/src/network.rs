use std::collections::HashMap;
use std::mem::size_of;
use std::process;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use windows::core::{GUID, PCWSTR, PWSTR};
use windows::Win32::System::Diagnostics::Etw::{
    CloseTrace, ControlTraceW, EnableTraceEx2, OpenTraceW, ProcessTrace, StartTraceW,
    CONTROLTRACE_HANDLE, EVENT_CONTROL_CODE_ENABLE_PROVIDER, EVENT_RECORD,
    EVENT_TRACE_CONTROL_STOP, EVENT_TRACE_LOGFILEW, EVENT_TRACE_PROPERTIES,
    EVENT_TRACE_REAL_TIME_MODE, PROCESSTRACE_HANDLE, PROCESS_TRACE_MODE_EVENT_RECORD,
    PROCESS_TRACE_MODE_REAL_TIME, TRACE_LEVEL_INFORMATION, WNODE_FLAG_TRACED_GUID,
};

const PROVIDER_GUID: GUID = GUID::from_u128(0x7dd42a49_5329_4832_8dfd_43d979153a88);
const NETWORK_KEYWORDS: u64 = 0x30;
const ERROR_ALREADY_EXISTS: u32 = 183;

#[derive(Clone, Copy, Default)]
struct NetworkCounters {
    received: u64,
    sent: u64,
}

static NETWORK_COUNTERS: OnceLock<Mutex<HashMap<u32, NetworkCounters>>> = OnceLock::new();

fn counters() -> &'static Mutex<HashMap<u32, NetworkCounters>> {
    NETWORK_COUNTERS.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe extern "system" fn event_record_callback(record: *mut EVENT_RECORD) {
    unsafe {
        if record.is_null() {
            return;
        }

        let record = &*record;
        if record.EventHeader.ProviderId != PROVIDER_GUID {
            return;
        }

        let event_id = record.EventHeader.EventDescriptor.Id;
        let received = matches!(event_id, 11 | 27 | 43 | 59);
        let sent = matches!(event_id, 10 | 26 | 42 | 58);

        if !received && !sent {
            return;
        }

        // Kernel-Network payloads begin with the owning PID and byte count.
        if record.UserDataLength < 8 || record.UserData.is_null() {
            return;
        }

        let payload = std::slice::from_raw_parts(record.UserData as *const u8, 8);
        let pid = u32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]);
        let size = u32::from_le_bytes([payload[4], payload[5], payload[6], payload[7]]) as u64;

        if pid == 0 || size == 0 {
            return;
        }

        let Some(counters) = NETWORK_COUNTERS.get() else {
            return;
        };

        let mut counters = counters
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let entry = counters.entry(pid).or_default();

        if received {
            entry.received = entry.received.saturating_add(size);
        } else {
            entry.sent = entry.sent.saturating_add(size);
        }
    }
}

fn session_properties(session_name: &[u16]) -> Vec<u64> {
    let header_size = size_of::<EVENT_TRACE_PROPERTIES>();
    let total_size = header_size + session_name.len() * size_of::<u16>();
    let words = total_size.div_ceil(size_of::<u64>());
    let mut buffer = vec![0u64; words];

    unsafe {
        let properties = buffer.as_mut_ptr().cast::<EVENT_TRACE_PROPERTIES>();
        (*properties).Wnode.BufferSize = (words * size_of::<u64>()) as u32;
        (*properties).Wnode.Flags = WNODE_FLAG_TRACED_GUID;
        (*properties).Wnode.ClientContext = 1;
        (*properties).LogFileMode = EVENT_TRACE_REAL_TIME_MODE;
        (*properties).BufferSize = 64;
        (*properties).MinimumBuffers = 4;
        (*properties).MaximumBuffers = 16;
        (*properties).FlushTimer = 1;
        (*properties).LoggerNameOffset = header_size as u32;

        let name_offset = (buffer.as_mut_ptr() as *mut u8)
            .add(header_size)
            .cast::<u16>();
        std::ptr::copy_nonoverlapping(session_name.as_ptr(), name_offset, session_name.len());
    }

    buffer
}

fn stop_session(handle: CONTROLTRACE_HANDLE, name: PCWSTR, properties: &mut [u64]) {
    unsafe {
        let _ = ControlTraceW(
            handle,
            name,
            properties.as_mut_ptr().cast::<EVENT_TRACE_PROPERTIES>(),
            EVENT_TRACE_CONTROL_STOP,
        );
    }
}

/// Real-time ETW collector for Microsoft-Windows-Kernel-Network.
///
/// Windows does not expose per-process network byte counters to a regular
/// process. The kernel provider requires administrator rights, so a failed
/// start simply leaves the sampler without attribution.
pub struct NetworkCollector {
    session_handle: CONTROLTRACE_HANDLE,
    logger_handle: PROCESSTRACE_HANDLE,
    session_name: Vec<u16>,
    properties: Vec<u64>,
    // Kept alive for as long as ProcessTrace is running on the ETW thread.
    #[allow(dead_code)]
    logfile: Box<EVENT_TRACE_LOGFILEW>,
    running: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl NetworkCollector {
    pub fn start() -> Option<Self> {
        let session = format!("WindogNetwork-{}", process::id());
        let session_name: Vec<u16> = session.encode_utf16().chain(std::iter::once(0)).collect();
        let mut properties = session_properties(&session_name);
        let name = PCWSTR(session_name.as_ptr());
        let mut session_handle = CONTROLTRACE_HANDLE::default();

        let mut status = unsafe {
            StartTraceW(
                &mut session_handle,
                name,
                properties.as_mut_ptr().cast::<EVENT_TRACE_PROPERTIES>(),
            )
        };

        if status.0 == ERROR_ALREADY_EXISTS {
            let mut stale = session_properties(&session_name);
            stop_session(CONTROLTRACE_HANDLE::default(), name, &mut stale);
            properties = session_properties(&session_name);
            status = unsafe {
                StartTraceW(
                    &mut session_handle,
                    name,
                    properties.as_mut_ptr().cast::<EVENT_TRACE_PROPERTIES>(),
                )
            };
        }

        if status.0 != 0 {
            return None;
        }

        let enable = unsafe {
            EnableTraceEx2(
                session_handle,
                &PROVIDER_GUID,
                EVENT_CONTROL_CODE_ENABLE_PROVIDER.0,
                TRACE_LEVEL_INFORMATION as u8,
                NETWORK_KEYWORDS,
                0,
                0,
                None,
            )
        };

        if enable.0 != 0 {
            stop_session(session_handle, PCWSTR::null(), &mut properties);
            return None;
        }

        counters()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();

        let mut logfile = Box::new(EVENT_TRACE_LOGFILEW::default());
        logfile.LoggerName = PWSTR(session_name.as_ptr() as *mut u16);
        logfile.Anonymous1.ProcessTraceMode =
            PROCESS_TRACE_MODE_REAL_TIME | PROCESS_TRACE_MODE_EVENT_RECORD;
        logfile.Anonymous2.EventRecordCallback = Some(event_record_callback);

        let logger_handle = unsafe { OpenTraceW(&mut *logfile) };

        if logger_handle.Value == 0 || logger_handle.Value == u64::MAX {
            stop_session(session_handle, PCWSTR::null(), &mut properties);
            return None;
        }

        let running = Arc::new(AtomicBool::new(true));
        let thread_running = running.clone();

        let thread = thread::Builder::new()
            .name("windog-network-etw".to_string())
            .spawn(move || {
                let _ = unsafe { ProcessTrace(&[logger_handle], None, None) };
                thread_running.store(false, Ordering::Relaxed);
            })
            .ok();

        if thread.is_none() {
            stop_session(session_handle, PCWSTR::null(), &mut properties);
            unsafe {
                let _ = CloseTrace(logger_handle);
            }
            return None;
        }

        Some(Self {
            session_handle,
            logger_handle,
            session_name,
            properties,
            logfile,
            running,
            thread,
        })
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    /// Returns bytes received and sent per process since the previous drain.
    pub fn drain(&self) -> HashMap<u32, (u64, u64)> {
        counters()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .drain()
            .map(|(pid, value)| (pid, (value.received, value.sent)))
            .collect()
    }
}

impl Drop for NetworkCollector {
    fn drop(&mut self) {
        stop_session(
            self.session_handle,
            PCWSTR(self.session_name.as_ptr()),
            &mut self.properties,
        );

        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }

        unsafe {
            let _ = CloseTrace(self.logger_handle);
        }
    }
}
