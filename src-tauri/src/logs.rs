use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use windows::core::HSTRING;
use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS};
use windows::core::Owned;
use windows::Win32::System::EventLog::{
    EvtNext, EvtQuery, EvtQueryChannelPath, EvtQueryReverseDirection, EvtRender, EvtRenderEventXml,
    EVT_HANDLE,
};

const MAX_EVENTS_PER_CHANNEL: usize = 100;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsOsInfo {
    pub caption: Option<String>,
    pub version: Option<String>,
    pub build: Option<String>,
    pub architecture: Option<String>,
    pub install_date: Option<String>,
    pub last_boot: Option<String>,
    pub free_physical_memory_kb: Option<u64>,
    pub total_visible_memory_kb: Option<u64>,
    pub free_virtual_memory_kb: Option<u64>,
    pub serial_number: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsMachineInfo {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub total_physical_memory: Option<u64>,
    pub number_of_processors: Option<u32>,
    pub number_of_logical_processors: Option<u32>,
    pub pc_system_type: Option<u32>,
    pub serial_number: Option<String>,
    pub chassis_type: Option<u32>,
    pub bios_version: Option<String>,
    pub bios_date: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsActivation {
    pub name: Option<String>,
    pub status: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsBattery {
    pub name: Option<String>,
    pub chemistry: Option<u32>,
    pub design_capacity: Option<u32>,
    pub full_charge_capacity: Option<u32>,
    pub charge_percent: Option<u32>,
    pub status: Option<u32>,
    pub estimated_run_time: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsStorage {
    pub friendly_name: Option<String>,
    pub media_type: Option<u32>,
    pub bus_type: Option<u32>,
    pub health_status: Option<u32>,
    pub operational_status: Option<String>,
    pub size_bytes: Option<u64>,
    pub temperature: Option<u8>,
    pub power_on_hours: Option<u32>,
    pub wear: Option<u8>,
    pub read_errors_total: Option<u64>,
    pub read_errors_uncorrected: Option<u64>,
    pub write_errors_total: Option<u64>,
    pub write_errors_uncorrected: Option<u64>,
    pub read_latency_max: Option<u64>,
    pub write_latency_max: Option<u64>,
    pub smart_predict_failure: Option<bool>,
    pub smart_reason: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsDeviceProblem {
    pub name: Option<String>,
    pub class_guid: Option<String>,
    pub device_id: Option<String>,
    pub manufacturer: Option<String>,
    pub error_code: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsFirewallProfile {
    pub name: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsBitlockerVolume {
    pub volume: Option<String>,
    pub protection_status: Option<u32>,
    pub encryption_percent: Option<u32>,
    pub volume_status: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsSecurity {
    pub defender_realtime: Option<bool>,
    pub defender_antivirus: Option<bool>,
    pub defender_antispyware: Option<bool>,
    pub defender_signature_last_updated: Option<String>,
    pub defender_quick_scan_age: Option<u32>,
    pub defender_full_scan_age: Option<u32>,
    pub firewall_profiles: Vec<LogsFirewallProfile>,
    #[serde(default)]
    pub bitlocker: Vec<LogsBitlockerVolume>,
    pub secure_boot: Option<bool>,
    pub tpm_present: Option<bool>,
    pub tpm_ready: Option<bool>,
    pub pending_reboot: bool,
    pub uac_enabled: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsReliabilityRecord {
    pub time: Option<String>,
    pub product_name: Option<String>,
    pub message: Option<String>,
    pub event_identifier: Option<u32>,
    pub source_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsSoftware {
    pub name: Option<String>,
    pub version: Option<String>,
    pub publisher: Option<String>,
    pub install_date: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsDriver {
    pub device_name: Option<String>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    pub signer: Option<String>,
    pub inf_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsSmartFailure {
    pub instance: Option<String>,
    pub reason: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsEvent {
    pub channel: String,
    pub provider: String,
    pub event_id: u32,
    pub record_id: u64,
    pub time: Option<i64>,
    pub level: String,
    pub category: String,
    pub headline: String,
    pub detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsSnapshot {
    pub captured_at: i64,
    pub os: Option<LogsOsInfo>,
    pub activation: Option<LogsActivation>,
    pub machine: Option<LogsMachineInfo>,
    pub battery: Option<LogsBattery>,
    pub storage: Vec<LogsStorage>,
    pub smart_failures: Vec<LogsSmartFailure>,
    pub device_problems: Vec<LogsDeviceProblem>,
    pub security: Option<LogsSecurity>,
    pub reliability: Vec<LogsReliabilityRecord>,
    pub software: Vec<LogsSoftware>,
    pub software_count: usize,
    pub drivers: Vec<LogsDriver>,
    pub events: Vec<LogsEvent>,
    pub log_error: Option<String>,
}

// Intermediate deserialization struct for the PowerShell JSON output.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PsLogs {
    os: Option<LogsOsInfo>,
    activation: Option<LogsActivation>,
    machine: Option<LogsMachineInfo>,
    battery: Option<LogsBattery>,
    storage: Option<Vec<LogsStorage>>,
    smart_failures: Option<Vec<LogsSmartFailure>>,
    device_problems: Option<Vec<LogsDeviceProblem>>,
    security: Option<LogsSecurity>,
    reliability: Option<Vec<LogsReliabilityRecord>>,
    software: Option<Vec<LogsSoftware>>,
    software_count: Option<usize>,
    drivers: Option<Vec<LogsDriver>>,
}

#[tauri::command]
pub async fn logs_snapshot() -> Result<LogsSnapshot, String> {
    tauri::async_runtime::spawn_blocking(collect_snapshot)
        .await
        .map_err(|error| format!("Logs task failed: {error}"))
}

#[tauri::command]
pub async fn logs_bitlocker() -> Result<Vec<LogsBitlockerVolume>, String> {
    tauri::async_runtime::spawn_blocking(collect_bitlocker)
        .await
        .map_err(|error| format!("BitLocker task failed: {error}"))?
}

fn collect_bitlocker() -> Result<Vec<LogsBitlockerVolume>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$bl = @()
try { $bl = Get-BitLockerVolume } catch { }
@($bl | ForEach-Object { [ordered]@{ volume = $_.MountPoint; protectionStatus = [int]$_.ProtectionStatus; encryptionPercent = [int]$_.EncryptionPercentage; volumeStatus = [int]$_.VolumeStatus } }) | ConvertTo-Json -Depth 4 -Compress
"#;
    let output = run_powershell(script)?;
    if output.is_empty() || output == "null" {
        return Ok(Vec::new());
    }
    if output.trim_start().starts_with('[') {
        serde_json::from_str(&output).map_err(|error| format!("Could not parse BitLocker volumes: {error}"))
    } else {
        let single: LogsBitlockerVolume = serde_json::from_str(&output)
            .map_err(|error| format!("Could not parse BitLocker volumes: {error}"))?;
        Ok(vec![single])
    }
}

fn collect_snapshot() -> LogsSnapshot {
    let captured_at = epoch_now_ms();
    let (health, health_error) = collect_health();
    let events = collect_events();

    LogsSnapshot {
        captured_at,
        os: health.as_ref().and_then(|h| h.os.clone()),
        activation: health.as_ref().and_then(|h| h.activation.clone()),
        machine: health.as_ref().and_then(|h| h.machine.clone()),
        battery: health.as_ref().and_then(|h| h.battery.clone()),
        storage: health.as_ref().and_then(|h| h.storage.clone()).unwrap_or_default(),
        smart_failures: health.as_ref().and_then(|h| h.smart_failures.clone()).unwrap_or_default(),
        device_problems: health.as_ref().and_then(|h| h.device_problems.clone()).unwrap_or_default(),
        security: health.as_ref().and_then(|h| h.security.clone()),
        reliability: health.as_ref().and_then(|h| h.reliability.clone()).unwrap_or_default(),
        software: health.as_ref().and_then(|h| h.software.clone()).unwrap_or_default(),
        software_count: health.as_ref().and_then(|h| h.software_count).unwrap_or(0),
        drivers: health.as_ref().and_then(|h| h.drivers.clone()).unwrap_or_default(),
        events,
        log_error: health_error,
    }
}

fn collect_health() -> (Option<PsLogs>, Option<String>) {
    let script = HEALTH_SCRIPT;
    let output = run_powershell(script);
    match output {
        Ok(stdout) => {
            if stdout.is_empty() || stdout == "null" {
                return (None, Some("Windows did not return any system information.".to_string()));
            }
            match serde_json::from_str::<PsLogs>(&stdout) {
                Ok(parsed) => (Some(parsed), None),
                Err(error) => (
                    None,
                    Some(format!("Could not parse system information: {error}")),
                ),
            }
        }
        Err(error) => (None, Some(error)),
    }
}

fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| format!("Windows could not run PowerShell: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if detail.is_empty() {
            "PowerShell failed.".to_string()
        } else {
            detail
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ---------- events ----------

fn collect_events() -> Vec<LogsEvent> {
    let mut events = Vec::new();
    events.extend(read_channel_events("System", SYSTEM_QUERY));
    events.extend(read_channel_events("Application", APPLICATION_QUERY));
    events.sort_by(|a, b| match (a.time, b.time) {
        (Some(at), Some(bt)) => bt.cmp(&at),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    });
    if events.len() > 500 {
        events.truncate(500);
    }
    events
}

const SYSTEM_QUERY: &str = "*[System[(EventID=1 or EventID=7 or EventID=11 or EventID=12 or EventID=13 or EventID=15 or EventID=17 or EventID=18 or EventID=19 or EventID=41 or EventID=51 or EventID=52 or EventID=55 or EventID=98 or EventID=100 or EventID=129 or EventID=140 or EventID=153 or EventID=219 or EventID=6005 or EventID=6006 or EventID=6008 or EventID=6009 or EventID=7000 or EventID=7009 or EventID=7011 or EventID=7031 or EventID=7034 or EventID=7045 or EventID=1001 or EventID=1074 or EventID=2013)]]";
const APPLICATION_QUERY: &str = "*[System[(EventID=1000 or EventID=1001 or EventID=1002 or EventID=1026 or EventID=903 or EventID=904 or EventID=905 or EventID=906 or EventID=907 or EventID=908 or EventID=800 or EventID=1022 or EventID=1033 or EventID=19 or EventID=20 or EventID=43 or EventID=44)]]";

fn read_channel_events(channel: &str, query: &str) -> Vec<LogsEvent> {
    let path = HSTRING::from(channel);
    let q = HSTRING::from(query);
    let result = unsafe {
        EvtQuery(
            None,
            &path,
            &q,
            EvtQueryChannelPath.0 | EvtQueryReverseDirection.0,
        )
    };
    let Ok(handle) = result else {
        return Vec::new();
    };
    let handle = unsafe { Owned::new(handle) };

    let mut events = Vec::new();
    loop {
        let mut batch = [0isize; 32];
        let mut returned = 0u32;
        let outcome = unsafe { EvtNext(*handle, &mut batch, 0, 0, &mut returned) };
        match outcome {
            Ok(()) if returned == 0 => break,
            Ok(()) => {}
            Err(error) if error.code() == ERROR_NO_MORE_ITEMS.to_hresult() => break,
            Err(_) => break,
        }

        let handles: Vec<Owned<EVT_HANDLE>> = batch[..returned as usize]
            .iter()
            .map(|h| unsafe { Owned::new(EVT_HANDLE(*h)) })
            .collect();

        for handle in handles {
            if events.len() >= MAX_EVENTS_PER_CHANNEL {
                return events;
            }
            if let Some(xml) = render_event_xml(*handle) {
                if let Some(event) = parse_log_event(channel, &xml) {
                    events.push(event);
                }
            }
        }
    }
    events
}

fn render_event_xml(event: EVT_HANDLE) -> Option<String> {
    let mut used = 0u32;
    let mut property_count = 0u32;
    let first = unsafe {
        EvtRender(
            None,
            event,
            EvtRenderEventXml.0,
            0,
            None,
            &mut used,
            &mut property_count,
        )
    };
    if let Err(error) = &first {
        if error.code() != ERROR_INSUFFICIENT_BUFFER.to_hresult() {
            return None;
        }
    }
    if used == 0 {
        return Some(String::new());
    }
    let mut buffer = vec![0u16; (used as usize).div_ceil(2)];
    let render = unsafe {
        EvtRender(
            None,
            event,
            EvtRenderEventXml.0,
            (buffer.len() * 2) as u32,
            Some(buffer.as_mut_ptr().cast()),
            &mut used,
            &mut property_count,
        )
    };
    if render.is_err() {
        return None;
    }
    let length = buffer.iter().position(|u| *u == 0).unwrap_or(buffer.len());
    Some(String::from_utf16_lossy(&buffer[..length]))
}

fn parse_log_event(channel: &str, xml: &str) -> Option<LogsEvent> {
    let event_id: u32 = element_text(xml, "EventID")?.trim().parse().ok()?;
    let provider = element(xml, "Provider")
        .and_then(|e| attribute(e, "Name"))
        .unwrap_or("Unknown")
        .to_string();
    let record_id: u64 = element_text(xml, "EventRecordID")?.trim().parse().ok()?;
    let time = element(xml, "TimeCreated")
        .and_then(|e| attribute(e, "SystemTime"))
        .and_then(parse_event_time);
    let level_num: u32 = element_text(xml, "Level").and_then(|v| v.trim().parse().ok()).unwrap_or(4);
    let level = match level_num {
        1 => "Critical",
        2 => "Error",
        3 => "Warning",
        5 => "Verbose",
        _ => "Information",
    }
    .to_string();

    let (category, headline, detail) = classify(channel, &provider, event_id, xml);

    Some(LogsEvent {
        channel: channel.to_string(),
        provider,
        event_id,
        record_id,
        time,
        level,
        category,
        headline,
        detail,
    })
}

fn classify(_channel: &str, provider: &str, event_id: u32, _xml: &str) -> (String, String, Option<String>) {
    let provider_lower = provider.to_ascii_lowercase();
    // WHEA hardware
    if provider_lower.contains("whea") {
        let headline = match event_id {
            1 | 18 => "Fatal hardware error".to_string(),
            17 | 19 => "Corrected hardware error".to_string(),
            _ => "Hardware error".to_string(),
        };
        return ("Hardware".to_string(), headline, None);
    }
    // disk
    if provider_lower == "disk" {
        let headline = match event_id {
            7 => "Bad block on disk".to_string(),
            11 => "Disk controller error".to_string(),
            15 => "Disk not ready".to_string(),
            51 => "Paging operation error".to_string(),
            52 => "SMART predictive failure".to_string(),
            129 => "Disk reset issued".to_string(),
            153 => "Disk I/O retried".to_string(),
            2013 => "Disk near capacity".to_string(),
            _ => "Disk event".to_string(),
        };
        return ("Storage".to_string(), headline, None);
    }
    if provider_lower == "ntfs" {
        let headline = match event_id {
            55 => "NTFS structure corrupt".to_string(),
            98 => "Volume flagged dirty".to_string(),
            140 => "NTFS flush failed".to_string(),
            _ => "File system event".to_string(),
        };
        return ("Storage".to_string(), headline, None);
    }
    if provider_lower.contains("storahci") || provider_lower.contains("storport") {
        return ("Storage".to_string(), "Storage controller reset".to_string(), None);
    }
    // kernel-power
    if provider_lower == "microsoft-windows-kernel-power" {
        let headline = if event_id == 41 {
            "Unexpected power off".to_string()
        } else {
            "Power event".to_string()
        };
        return ("Power".to_string(), headline, None);
    }
    // bugcheck
    if provider_lower.contains("wer-systemerrorreporting") || provider_lower.contains("bugcheck") {
        return ("Crash".to_string(), "Windows stop error (BSOD)".to_string(), None);
    }
    // kernel-pnp
    if provider_lower == "microsoft-windows-kernel-pnp" {
        return ("Drivers".to_string(), "Driver failed to load".to_string(), None);
    }
    // service control manager
    if provider_lower == "service control manager" {
        let headline = match event_id {
            7000 => "Service failed to start".to_string(),
            7009 => "Service connect timeout".to_string(),
            7011 => "Service did not respond".to_string(),
            7031 | 7034 => "Service terminated unexpectedly".to_string(),
            7045 => "New service installed".to_string(),
            7036 => "Service state change".to_string(),
            _ => "Service event".to_string(),
        };
        let category = if event_id == 7045 { "Security" } else { "Services" };
        return (category.to_string(), headline, None);
    }
    // eventlog boot
    if provider_lower == "eventlog" {
        let headline = match event_id {
            6005 => "System booted".to_string(),
            6006 => "Clean shutdown".to_string(),
            6008 => "Previous shutdown unexpected".to_string(),
            6009 => "Windows version".to_string(),
            6013 => "Uptime report".to_string(),
            _ => "Event log".to_string(),
        };
        let category = match event_id {
            6008 => "Power",
            _ => "System",
        };
        return (category.to_string(), headline, None);
    }
    // kernel-general
    if provider_lower == "microsoft-windows-kernel-general" {
        let headline = match event_id {
            12 => "Operating system started".to_string(),
            13 => "Operating system shutting down".to_string(),
            _ => "Kernel event".to_string(),
        };
        return ("System".to_string(), headline, None);
    }
    // user32 shutdown
    if provider_lower == "user32" {
        return ("Power".to_string(), "Shutdown or restart requested".to_string(), None);
    }
    // windows update
    if provider_lower.to_ascii_lowercase().contains("windowsupdateclient") {
        let headline = match event_id {
            19 => "Update installed".to_string(),
            20 => "Update failed".to_string(),
            43 => "Update installation started".to_string(),
            44 => "Update download started".to_string(),
            _ => "Windows Update event".to_string(),
        };
        let category = if event_id == 20 { "Updates" } else { "Updates" };
        return (category.to_string(), headline, None);
    }
    // application error/hang
    if provider_lower == "application error" {
        return ("Crash".to_string(), "Application crashed".to_string(), None);
    }
    if provider_lower == "application hang" {
        return ("Crash".to_string(), "Application stopped responding".to_string(), None);
    }
    if provider_lower == ".net runtime" {
        return ("Crash".to_string(), ".NET unhandled exception".to_string(), None);
    }
    if provider_lower.contains("windows error reporting") {
        return ("Crash".to_string(), "Crash report".to_string(), None);
    }
    // program inventory
    if provider_lower.contains("application-experience") || provider_lower.contains("program-inventory") {
        let headline = match event_id {
            903 | 904 => "Application installed".to_string(),
            905 | 906 => "Application updated".to_string(),
            907 | 908 => "Application removed".to_string(),
            800 => "Software activity summary".to_string(),
            _ => "Software inventory event".to_string(),
        };
        return ("Software".to_string(), headline, None);
    }
    if provider_lower.contains("msiinstaller") {
        return ("Software".to_string(), "MSI package installed".to_string(), None);
    }
    if provider_lower.contains("servicing") {
        return ("Updates".to_string(), "Update package installed".to_string(), None);
    }
    // default
    ("System".to_string(), format!("{provider} event {event_id}"), None)
}

// ---------- helpers ----------

fn element<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let marker = format!("<{tag}");
    let start = xml.find(&marker)?;
    let end = start + xml[start..].find('>')? + 1;
    Some(&xml[start..end])
}

fn element_text<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let marker = format!("<{tag}");
    let start = xml.find(&marker)?;
    let content_start = start + xml[start..].find('>')? + 1;
    let close = format!("</{tag}>");
    let content_end = content_start + xml[content_start..].find(&close)?;
    Some(&xml[content_start..content_end])
}

fn attribute<'a>(element: &'a str, name: &str) -> Option<&'a str> {
    for quote in ['\'', '"'] {
        let marker = format!(" {name}={quote}");
        if let Some(position) = element.find(&marker) {
            let value_start = position + marker.len();
            let value_end = value_start + element[value_start..].find(quote)?;
            return Some(&element[value_start..value_end]);
        }
    }
    None
}

fn parse_event_time(value: &str) -> Option<i64> {
    if !value.is_ascii() || value.len() < 19 {
        return None;
    }
    let bytes = value.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let year: i64 = value[0..4].parse().ok()?;
    let month: u32 = value[5..7].parse().ok()?;
    let day: u32 = value[8..10].parse().ok()?;
    let hour: i64 = value[11..13].parse().ok()?;
    let minute: i64 = value[14..16].parse().ok()?;
    let second: i64 = value[17..19].parse().ok()?;
    // reuse days_from_civil
    let millis = if bytes.len() > 19 && bytes[19] == b'.' {
        let fraction_end = bytes[20..].iter().position(|b| !b.is_ascii_digit()).map(|o| o + 20).unwrap_or(bytes.len());
        let mut fraction = String::new();
        for c in value[20..fraction_end].chars().take(3) {
            fraction.push(c);
        }
        while fraction.len() < 3 {
            fraction.push('0');
        }
        fraction.parse::<i64>().ok()?
    } else {
        0
    };
    Some(days_from_civil(year, month, day) * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1_000 + millis)
}

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp as i64 + 2) / 5 + day as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn epoch_now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

const HEALTH_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$result = [ordered]@{}

$os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
$result.os = if ($os) { [ordered]@{
  caption = $os.Caption
  version = $os.Version
  build = $os.BuildNumber
  architecture = $os.OSArchitecture
  installDate = if ($os.InstallDate) { $os.InstallDate.ToString('o') } else { $null }
  lastBoot = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString('o') } else { $null }
  freePhysicalMemoryKb = [int64]$os.FreePhysicalMemory
  totalVisibleMemoryKb = [int64]$os.TotalVisibleMemorySize
  freeVirtualMemoryKb = [int64]$os.FreeVirtualMemory
  serialNumber = $os.SerialNumber
} } else { $null }

$lic = Get-CimInstance SoftwareLicensingProduct -Filter "PartialProductKey is not null" | Select-Object -First 1
$result.activation = if ($lic) { [ordered]@{ name = $lic.Name; status = [int]$lic.LicenseStatus } } else { $null }

$cs = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
$enc = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$result.machine = [ordered]@{
  manufacturer = $cs.Manufacturer
  model = $cs.Model
  totalPhysicalMemory = [int64]$cs.TotalPhysicalMemory
  numberOfProcessors = [int]$cs.NumberOfProcessors
  numberOfLogicalProcessors = [int]$cs.NumberOfLogicalProcessors
  pcSystemType = [int]$cs.PCSystemType
  serialNumber = $enc.SerialNumber
  chassisType = if ($enc.ChassisTypes) { [int]$enc.ChassisTypes[0] } else { $null }
  biosVersion = if ($bios.SMBIOSBIOSVersion) { $bios.SMBIOSBIOSVersion } else { $bios.Version }
  biosDate = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('o') } else { $null }
}

$batt = Get-CimInstance Win32_Battery | Select-Object -First 1
$result.battery = if ($batt) { [ordered]@{
  name = $batt.Name
  chemistry = [int]$batt.Chemistry
  designCapacity = [int]$batt.DesignCapacity
  fullChargeCapacity = [int]$batt.FullChargeCapacity
  chargePercent = [int]$batt.EstimatedChargeRemaining
  status = [int]$batt.BatteryStatus
  estimatedRunTime = [int]$batt.EstimatedRunTime
} } else { $null }

$smartList = @()
try { $smartList = Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus } catch { }
$storage = @()
$physDisks = @()
try { $physDisks = Get-PhysicalDisk } catch { }
foreach ($d in $physDisks) {
  $rc = $null
  try { $rc = $d | Get-StorageReliabilityCounter | Select-Object -First 1 } catch { }
  $smart = $smartList | Where-Object { $_.InstanceName -eq $d.UniqueId } | Select-Object -First 1
  $storage += [ordered]@{
    friendlyName = $d.FriendlyName
    mediaType = [int]$d.MediaType
    busType = [int]$d.BusType
    healthStatus = [int]$d.HealthStatus
    operationalStatus = ($d.OperationalStatus -join ',')
    sizeBytes = [int64]$d.Size
    temperature = if ($rc) { [int]$rc.Temperature } else { $null }
    powerOnHours = if ($rc) { [int]$rc.PowerOnHours } else { $null }
    wear = if ($rc) { [int]$rc.Wear } else { $null }
    readErrorsTotal = if ($rc) { [int64]$rc.ReadErrorsTotal } else { $null }
    readErrorsUncorrected = if ($rc) { [int64]$rc.ReadErrorsUncorrected } else { $null }
    writeErrorsTotal = if ($rc) { [int64]$rc.WriteErrorsTotal } else { $null }
    writeErrorsUncorrected = if ($rc) { [int64]$rc.WriteErrorsUncorrected } else { $null }
    readLatencyMax = if ($rc) { [int64]$rc.ReadLatencyMax } else { $null }
    writeLatencyMax = if ($rc) { [int64]$rc.WriteLatencyMax } else { $null }
    smartPredictFailure = if ($smart) { [bool]$smart.PredictFailure } else { $null }
    smartReason = if ($smart) { [int]$smart.Reason } else { $null }
  }
}
$result.storage = $storage
$result.smartFailures = @($smartList | Where-Object { $_.PredictFailure -eq $true } | ForEach-Object { [ordered]@{ instance = $_.InstanceName; reason = [int]$_.Reason } })

$badDevs = @()
try { $badDevs = Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $null -ne $_.ConfigManagerErrorCode } } catch { }
$result.deviceProblems = @($badDevs | ForEach-Object { [ordered]@{
  name = $_.Name
  classGuid = $_.ClassGuid
  deviceId = $_.DeviceID
  manufacturer = $_.Manufacturer
  errorCode = [int]$_.ConfigManagerErrorCode
} })

$def = $null
try { $def = Get-MpComputerStatus } catch { }
$fw = @()
try { $fw = Get-NetFirewallProfile } catch { }
$bl = @()
$secureBoot = $null
try { $secureBoot = Confirm-SecureBootUEFI } catch { }
$tpm = $null
try { $tpm = Get-Tpm } catch { }
$pendingReboot = $false
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $pendingReboot = $true }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $pendingReboot = $true }
$uac = $null
try { $uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name EnableLUA -ErrorAction SilentlyContinue).EnableLUA } catch { }
$result.security = [ordered]@{
  defenderRealtime = if ($def) { [bool]$def.RealTimeProtectionEnabled } else { $null }
  defenderAntivirus = if ($def) { [bool]$def.AntivirusEnabled } else { $null }
  defenderAntispyware = if ($def) { [bool]$def.AntispywareEnabled } else { $null }
  defenderSignatureLastUpdated = if ($def -and $def.AntivirusSignatureLastUpdated) { $def.AntivirusSignatureLastUpdated.ToString('o') } else { $null }
  defenderQuickScanAge = if ($def) { [int]$def.QuickScanAge } else { $null }
  defenderFullScanAge = if ($def) { [int]$def.FullScanAge } else { $null }
  firewallProfiles = @($fw | ForEach-Object { [ordered]@{ name = $_.Name; enabled = [bool]$_.Enabled } })
  bitlocker = @($bl | ForEach-Object { [ordered]@{ volume = $_.MountPoint; protectionStatus = [int]$_.ProtectionStatus; encryptionPercent = [int]$_.EncryptionPercentage; volumeStatus = [int]$_.VolumeStatus } })
  secureBoot = if ($secureBoot -ne $null) { [bool]$secureBoot } else { $null }
  tpmPresent = if ($tpm) { [bool]$tpm.TpmPresent } else { $null }
  tpmReady = if ($tpm) { [bool]$tpm.TpmReady } else { $null }
  pendingReboot = $pendingReboot
  uacEnabled = if ($uac -ne $null) { ($uac -ne 0) } else { $null }
}

$rel = @()
try { $rel = Get-CimInstance Win32_ReliabilityRecords | Sort-Object TimeGenerated -Descending | Select-Object -First 50 } catch { }
$result.reliability = @($rel | ForEach-Object { [ordered]@{
  time = if ($_.TimeGenerated) { $_.TimeGenerated.ToString('o') } else { $null }
  productName = $_.ProductName
  message = $_.Message
  eventIdentifier = [int]$_.EventIdentifier
  sourceName = $_.SourceName
} })

$sw = @()
$paths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($p in $paths) {
  $items = Get-ItemProperty $p -ErrorAction SilentlyContinue
  foreach ($i in $items) {
    if (-not $i.DisplayName) { continue }
    $sw += [ordered]@{
      name = ($i.DisplayName -replace "`0", "")
      version = $i.DisplayVersion
      publisher = $i.Publisher
      installDate = $i.InstallDate
    }
  }
}
$seen = @{}
$uniq = @()
foreach ($s in $sw) {
  $key = "$($s.name)|$($s.version)"
  if ($seen.ContainsKey($key)) { continue }
  $seen[$key] = $true
  $uniq += $s
}
$result.software = $uniq
$result.softwareCount = @($uniq).Count

$drv = @()
try { $drv = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | Sort-Object DriverDate -Descending | Select-Object -First 150) } catch { }
$result.drivers = @($drv | ForEach-Object { [ordered]@{
  deviceName = $_.DeviceName
  driverVersion = $_.DriverVersion
  driverDate = if ($_.DriverDate) { $_.DriverDate.ToString('o') } else { $null }
  signer = $_.Signer
  infName = $_.InfName
} })

$result | ConvertTo-Json -Depth 6 -Compress
"#;