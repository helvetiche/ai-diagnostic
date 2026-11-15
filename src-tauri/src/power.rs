use std::mem::{size_of, MaybeUninit};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::System;
use windows::core::{w, HSTRING, Owned};
use windows::Win32::Foundation::{
    ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS, FILETIME, SYSTEMTIME,
};
use windows::Win32::System::EventLog::{
    EvtGetLogInfo, EvtLogFileSize, EvtLogFull, EvtLogNumberOfLogRecords, EvtLogOldestRecordNumber,
    EvtNext, EvtOpenChannelPath, EvtOpenLog, EvtQuery, EvtQueryChannelPath,
    EvtQueryForwardDirection, EvtQueryReverseDirection, EvtRender, EvtRenderEventXml,
    EvtVarTypeBoolean, EvtVarTypeUInt64, EVT_HANDLE, EVT_LOG_PROPERTY_ID, EVT_VARIANT,
    EVT_VARIANT_TYPE_MASK,
};
use windows::Win32::System::Time::{SystemTimeToFileTime, TzSpecificLocalTimeToSystemTime};
use windows::Win32::System::WindowsProgramming::QueryUnbiasedInterruptTime;
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

const CHANNEL: &str = "System";
const QUERY: &str = "*[System[(EventID=13 or EventID=41 or EventID=1001 or EventID=1074 or EventID=6006 or EventID=6008)]]";
const MAX_EVENTS: usize = 500;
const REQUEST_MERGE_MS: i64 = 10_000;
const STOP_MERGE_MS: i64 = 15_000;
const REQUEST_STOP_WINDOW_MS: i64 = 60 * 60 * 1000;
const BOOT_PAIR_WINDOW_MS: i64 = 10 * 60 * 1000;
const FAST_STARTUP_KEY: &str = r"SYSTEM\CurrentControlSet\Control\Session Manager\Power";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerFact {
    pub label: String,
    pub value: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerEvent {
    pub event_id: u32,
    pub provider: String,
    pub record_id: u64,
    pub time: Option<i64>,
    pub role: String,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PowerKind {
    Shutdown,
    Restart,
    CleanStop,
    UnexpectedStop,
    Bugcheck,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PowerSeverity {
    Critical,
    Warning,
    Info,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerRecord {
    pub id: String,
    pub kind: PowerKind,
    pub time: Option<i64>,
    pub time_note: Option<String>,
    pub headline: String,
    pub detail: String,
    pub severity: PowerSeverity,
    pub is_stop: bool,
    pub facts: Vec<PowerFact>,
    pub events: Vec<PowerEvent>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerLogInfo {
    pub record_count: u64,
    pub oldest_record: u64,
    pub newest_record: u64,
    pub file_bytes: u64,
    pub full: bool,
    pub oldest_time: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerSnapshot {
    pub captured_at: i64,
    pub uptime_seconds: Option<u64>,
    pub active_seconds: Option<u64>,
    pub sleep_seconds: Option<u64>,
    pub boot_time: Option<i64>,
    pub fast_startup: Option<bool>,
    pub log: Option<PowerLogInfo>,
    pub log_error: Option<String>,
    pub truncated: bool,
    pub shutdowns: Vec<PowerRecord>,
    pub restarts: Vec<PowerRecord>,
    pub power_offs: Vec<PowerRecord>,
    pub unclassified_stops: Vec<PowerRecord>,
}

#[derive(Clone)]
struct RawEvent {
    event_id: u32,
    provider: String,
    record_id: u64,
    time: Option<i64>,
    data: Vec<(String, String)>,
    binary: Option<Vec<u8>>,
}

impl RawEvent {
    fn data(&self, name: &str) -> Option<&str> {
        self.data
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

struct RawLog {
    events: Vec<RawEvent>,
    truncated: bool,
    info: Option<PowerLogInfo>,
    error: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RequestAction {
    Shutdown,
    Restart,
}

struct RequestCluster {
    action: RequestAction,
    events: Vec<RawEvent>,
}

impl RequestCluster {
    fn time(&self) -> Option<i64> {
        self.events.iter().filter_map(|event| event.time).min()
    }
}

struct CleanStop {
    events: Vec<RawEvent>,
    time: Option<i64>,
}

#[tauri::command]
pub async fn power_history() -> Result<PowerSnapshot, String> {
    tauri::async_runtime::spawn_blocking(collect_snapshot)
        .await
        .map_err(|error| format!("Power history task failed: {error}"))
}

fn collect_snapshot() -> PowerSnapshot {
    let captured_at = epoch_now_ms();
    let uptime_seconds = System::uptime().ok();
    let active_seconds = active_uptime_seconds();
    let sleep_seconds = uptime_seconds
        .zip(active_seconds)
        .map(|(uptime, active)| uptime.saturating_sub(active));
    let boot_time = uptime_seconds
        .map(|uptime| captured_at - (uptime.saturating_mul(1_000)) as i64);
    let fast_startup = read_fast_startup();
    let raw_log = read_system_log();

    let request_clusters = classify_requests(&raw_log.events);
    let clean_stops = classify_clean_stops(&raw_log.events);
    let kernel_power_events: Vec<&RawEvent> = raw_log
        .events
        .iter()
        .filter(|event| {
            event.event_id == 41
                && event
                    .provider
                    .eq_ignore_ascii_case("Microsoft-Windows-Kernel-Power")
        })
        .collect();

    let (shutdowns, restarts, unclassified_stops) =
        build_planned_records(&request_clusters, &clean_stops, &kernel_power_events);
    let power_offs = build_power_offs(&raw_log.events);

    PowerSnapshot {
        captured_at,
        uptime_seconds,
        active_seconds,
        sleep_seconds,
        boot_time,
        fast_startup,
        log: raw_log.info,
        log_error: raw_log.error,
        truncated: raw_log.truncated,
        shutdowns,
        restarts,
        power_offs,
        unclassified_stops,
    }
}

fn read_system_log() -> RawLog {
    let info = read_log_info();

    match read_events() {
        Ok((events, truncated)) => RawLog {
            events,
            truncated,
            info,
            error: None,
        },
        Err(error) => RawLog {
            events: Vec::new(),
            truncated: false,
            info,
            error: Some(error),
        },
    }
}

fn read_events() -> Result<(Vec<RawEvent>, bool), String> {
    let path = HSTRING::from(CHANNEL);
    let query = HSTRING::from(QUERY);
    let result = unsafe {
        EvtQuery(
            None,
            &path,
            &query,
            EvtQueryChannelPath.0 | EvtQueryReverseDirection.0,
        )
    }
    .map_err(|error| format!("Windows could not read the System event log: {error}"))?;
    let result = unsafe { Owned::new(result) };
    let mut events = Vec::new();

    loop {
        let mut batch = [0isize; 32];
        let mut returned = 0u32;

        match unsafe { EvtNext(*result, &mut batch, 0, 0, &mut returned) } {
            Ok(()) if returned == 0 => break,
            Ok(()) => {}
            Err(error) if error.code() == ERROR_NO_MORE_ITEMS.to_hresult() => break,
            Err(error) => {
                return Err(format!(
                    "Windows could not read the next batch of System events: {error}"
                ));
            }
        }

        let handles: Vec<Owned<EVT_HANDLE>> = batch[..returned as usize]
            .iter()
            .map(|handle| unsafe { Owned::new(EVT_HANDLE(*handle)) })
            .collect();

        for handle in handles {
            let xml = render_event_xml(*handle)?;

            if let Some(event) = parse_event(&xml) {
                events.push(event);
            }

            if events.len() >= MAX_EVENTS {
                return Ok((events, true));
            }
        }
    }

    Ok((events, false))
}

fn render_event_xml(event: EVT_HANDLE) -> Result<String, String> {
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
            return Err(format!("Windows could not render a System event: {error}"));
        }
    }

    if used == 0 {
        return Ok(String::new());
    }

    let mut buffer = vec![0u16; (used as usize).div_ceil(2)];

    unsafe {
        EvtRender(
            None,
            event,
            EvtRenderEventXml.0,
            (buffer.len() * 2) as u32,
            Some(buffer.as_mut_ptr().cast()),
            &mut used,
            &mut property_count,
        )
    }
    .map_err(|error| format!("Windows could not render a System event: {error}"))?;

    let length = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(buffer.len());

    Ok(String::from_utf16_lossy(&buffer[..length]))
}

fn read_log_info() -> Option<PowerLogInfo> {
    let handle = unsafe { EvtOpenLog(None, w!("System"), EvtOpenChannelPath.0) }.ok()?;
    let handle = unsafe { Owned::new(handle) };

    let record_count = log_u64(*handle, EvtLogNumberOfLogRecords)?;
    let oldest_record = log_u64(*handle, EvtLogOldestRecordNumber)?;
    let file_bytes = log_u64(*handle, EvtLogFileSize).unwrap_or(0);
    let full = log_bool(*handle, EvtLogFull).unwrap_or(false);
    let newest_record = if record_count == 0 {
        oldest_record
    } else {
        oldest_record.saturating_add(record_count - 1)
    };

    Some(PowerLogInfo {
        record_count,
        oldest_record,
        newest_record,
        file_bytes,
        full,
        oldest_time: oldest_event_time(),
    })
}

fn oldest_event_time() -> Option<i64> {
    let path = HSTRING::from(CHANNEL);
    let query = HSTRING::from("*");
    let result = unsafe {
        EvtQuery(
            None,
            &path,
            &query,
            EvtQueryChannelPath.0 | EvtQueryForwardDirection.0,
        )
    }
    .ok()?;
    let result = unsafe { Owned::new(result) };
    let mut batch = [0isize; 1];
    let mut returned = 0u32;

    match unsafe { EvtNext(*result, &mut batch, 0, 0, &mut returned) } {
        Ok(()) if returned == 1 => {}
        _ => return None,
    }

    let event = unsafe { Owned::new(EVT_HANDLE(batch[0])) };
    let xml = render_event_xml(*event).ok()?;
    parse_event(&xml)?.time
}

fn log_value(handle: EVT_HANDLE, property: EVT_LOG_PROPERTY_ID) -> Option<EVT_VARIANT> {
    let mut value = MaybeUninit::<EVT_VARIANT>::zeroed();
    let mut used = 0u32;

    unsafe {
        EvtGetLogInfo(
            handle,
            property,
            size_of::<EVT_VARIANT>() as u32,
            Some(value.as_mut_ptr()),
            &mut used,
        )
        .ok()?;

        Some(value.assume_init())
    }
}

fn log_u64(handle: EVT_HANDLE, property: EVT_LOG_PROPERTY_ID) -> Option<u64> {
    let value = log_value(handle, property)?;

    if value.Type & EVT_VARIANT_TYPE_MASK != EvtVarTypeUInt64.0 as u32 {
        return None;
    }

    Some(unsafe { value.Anonymous.UInt64Val })
}

fn log_bool(handle: EVT_HANDLE, property: EVT_LOG_PROPERTY_ID) -> Option<bool> {
    let value = log_value(handle, property)?;

    if value.Type & EVT_VARIANT_TYPE_MASK != EvtVarTypeBoolean.0 as u32 {
        return None;
    }

    Some(unsafe { value.Anonymous.BooleanVal.as_bool() })
}

fn parse_event(xml: &str) -> Option<RawEvent> {
    let event_id = element_text(xml, "EventID")?.trim().parse().ok()?;
    let provider = element(xml, "Provider")
        .and_then(|element| attribute(element, "Name"))
        .unwrap_or("Provider not recorded")
        .to_string();
    let record_id = element_text(xml, "EventRecordID")?.trim().parse().ok()?;
    let time = element(xml, "TimeCreated")
        .and_then(|element| attribute(element, "SystemTime"))
        .and_then(parse_event_time);
    let data = parse_event_data(xml);
    let binary = element_text(xml, "Binary")
        .filter(|value| !value.trim().is_empty())
        .and_then(parse_hex);

    Some(RawEvent {
        event_id,
        provider,
        record_id,
        time,
        data,
        binary,
    })
}

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

fn parse_event_data(xml: &str) -> Vec<(String, String)> {
    let Some(section_start) = xml.find("<EventData>") else {
        return Vec::new();
    };
    let Some(section_end) = xml[section_start..].find("</EventData>") else {
        return Vec::new();
    };
    let section =
        &xml[section_start + "<EventData>".len()..section_start + section_end];
    let mut values = Vec::new();
    let mut rest = section;

    while let Some(start) = rest.find("<Data") {
        let Some(open_offset) = rest[start..].find('>') else {
            break;
        };
        let open_end = start + open_offset + 1;
        let open_tag = &rest[start..open_end];
        let self_closing = open_tag.trim_end().ends_with("/>");
        let name = attribute(open_tag, "Name");

        if self_closing {
            if let Some(name) = name {
                values.push((name.to_string(), String::new()));
            }

            rest = &rest[open_end..];
            continue;
        }

        let Some(close_offset) = rest[open_end..].find("</Data>") else {
            break;
        };
        let close_start = open_end + close_offset;
        let text = unescape_xml(&rest[open_end..close_start]);

        if let Some(name) = name {
            values.push((name.to_string(), text));
        }

        rest = &rest[close_start + "</Data>".len()..];
    }

    values
}

fn unescape_xml(value: &str) -> String {
    if !value.contains('&') {
        return value.to_string();
    }

    let mut result = String::with_capacity(value.len());
    let mut rest = value;

    while let Some(position) = rest.find('&') {
        result.push_str(&rest[..position]);
        let tail = &rest[position..];

        if let Some(end) = tail.find(';') {
            let entity = &tail[1..end];
            let decoded = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                    u32::from_str_radix(&entity[2..], 16)
                        .ok()
                        .and_then(char::from_u32)
                }
                _ if entity.starts_with('#') => {
                    entity[1..].parse::<u32>().ok().and_then(char::from_u32)
                }
                _ => None,
            };

            if let Some(character) = decoded {
                result.push(character);
                rest = &tail[end + 1..];
            } else {
                result.push('&');
                rest = &tail[1..];
            }
        } else {
            result.push_str(tail);
            rest = "";
        }
    }

    result.push_str(rest);
    result
}

fn parse_hex(value: &str) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut high = None;

    for character in value.chars() {
        if character.is_ascii_whitespace() {
            continue;
        }

        let digit = character.to_digit(16)? as u8;

        match high {
            Some(high_nibble) => {
                bytes.push((high_nibble << 4) | digit);
                high = None;
            }
            None => high = Some(digit),
        }
    }

    if high.is_some() {
        return None;
    }

    Some(bytes)
}

fn parse_event_time(value: &str) -> Option<i64> {
    if !value.is_ascii() || value.len() < 19 {
        return None;
    }

    let bytes = value.as_bytes();

    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return None;
    }

    let year: i64 = value[0..4].parse().ok()?;
    let month: u32 = value[5..7].parse().ok()?;
    let day: u32 = value[8..10].parse().ok()?;
    let hour: i64 = value[11..13].parse().ok()?;
    let minute: i64 = value[14..16].parse().ok()?;
    let second: i64 = value[17..19].parse().ok()?;

    if !valid_date(year, month, day) || hour > 23 || minute > 59 || second > 59 {
        return None;
    }

    let millis = if bytes.len() > 19 && bytes[19] == b'.' {
        let fraction_end = bytes[20..]
            .iter()
            .position(|byte| !byte.is_ascii_digit())
            .map(|offset| offset + 20)
            .unwrap_or(bytes.len());
        let mut fraction = String::new();

        for character in value[20..fraction_end].chars().take(3) {
            fraction.push(character);
        }

        while fraction.len() < 3 {
            fraction.push('0');
        }

        fraction.parse::<i64>().ok()?
    } else {
        0
    };

    Some(
        days_from_civil(year, month, day) * 86_400_000
            + hour * 3_600_000
            + minute * 60_000
            + second * 1_000
            + millis,
    )
}

fn valid_date(year: i64, month: u32, day: u32) -> bool {
    if year < 1601 || day == 0 {
        return false;
    }

    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };

    day <= days
}

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_prime = (month + 9) % 12;
    let day_of_year = (153 * month_prime as i64 + 2) / 5 + day as i64 - 1;
    let day_of_era =
        year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    era * 146_097 + day_of_era - 719_468
}

fn system_time_to_epoch_ms(value: &SYSTEMTIME) -> Option<i64> {
    if !valid_date(value.wYear as i64, value.wMonth as u32, value.wDay as u32)
        || value.wHour > 23
        || value.wMinute > 59
        || value.wSecond > 59
    {
        return None;
    }

    let mut utc = SYSTEMTIME::default();

    unsafe {
        TzSpecificLocalTimeToSystemTime(None, value, &mut utc).ok()?;
    }

    let mut file_time = FILETIME::default();

    unsafe {
        SystemTimeToFileTime(&utc, &mut file_time).ok()?;
    }

    let ticks = ((file_time.dwHighDateTime as u64) << 32) | file_time.dwLowDateTime as u64;

    if ticks < 116_444_736_000_000_000 {
        return None;
    }

    Some((ticks / 10_000 - 11_644_473_600_000) as i64)
}

fn previous_stop_time(event: &RawEvent) -> Option<i64> {
    let binary = event.binary.as_ref()?;

    if binary.len() < 16 {
        return None;
    }

    let word = |offset: usize| u16::from_le_bytes([binary[offset], binary[offset + 1]]);
    let local = SYSTEMTIME {
        wYear: word(0),
        wMonth: word(2),
        wDayOfWeek: word(4),
        wDay: word(6),
        wHour: word(8),
        wMinute: word(10),
        wSecond: word(12),
        wMilliseconds: word(14),
    };

    system_time_to_epoch_ms(&local)
}

fn read_fast_startup() -> Option<bool> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(FAST_STARTUP_KEY)
        .ok()?;
    let value: u32 = key.get_value("HiberbootEnabled").ok()?;

    Some(value != 0)
}

fn active_uptime_seconds() -> Option<u64> {
    let mut ticks = 0u64;
    let success = unsafe { QueryUnbiasedInterruptTime(&mut ticks) };

    success.as_bool().then_some(ticks / 10_000_000)
}

fn epoch_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn classify_requests(events: &[RawEvent]) -> Vec<RequestCluster> {
    let mut requests: Vec<(RequestAction, RawEvent)> = events
        .iter()
        .filter(|event| {
            event.event_id == 1074 && event.provider.eq_ignore_ascii_case("User32")
        })
        .filter_map(|event| {
            let action = match event.data("param5")?.trim().to_ascii_lowercase().as_str() {
                "power off" => RequestAction::Shutdown,
                "restart" => RequestAction::Restart,
                _ => return None,
            };

            Some((action, event.clone()))
        })
        .collect();

    requests.sort_by_key(|(_, event)| event.time.unwrap_or(i64::MAX));

    let mut clusters: Vec<RequestCluster> = Vec::new();

    for (action, event) in requests {
        if let Some(last) = clusters.last_mut() {
            let close = event
                .time
                .zip(last.events.last().and_then(|previous| previous.time))
                .map(|(current, previous)| (current - previous).abs() <= REQUEST_MERGE_MS)
                .unwrap_or(false);
            let same_machine = event
                .data("param2")
                .zip(last.events.last().and_then(|previous| previous.data("param2")))
                .map(|(current, previous)| current.eq_ignore_ascii_case(previous))
                .unwrap_or(true);

            if last.action == action && close && same_machine {
                last.events.push(event);
                continue;
            }
        }

        clusters.push(RequestCluster {
            action,
            events: vec![event],
        });
    }

    clusters
}

fn classify_clean_stops(events: &[RawEvent]) -> Vec<CleanStop> {
    let mut stops: Vec<RawEvent> = events
        .iter()
        .filter(|event| {
            (event.event_id == 13
                && event
                    .provider
                    .eq_ignore_ascii_case("Microsoft-Windows-Kernel-General"))
                || (event.event_id == 6006 && event.provider.eq_ignore_ascii_case("EventLog"))
        })
        .cloned()
        .collect();

    stops.sort_by_key(|event| event.time.unwrap_or(i64::MAX));

    let mut clusters: Vec<Vec<RawEvent>> = Vec::new();

    for event in stops {
        if let Some(last) = clusters.last_mut() {
            let close = event
                .time
                .zip(last.last().and_then(|previous| previous.time))
                .map(|(current, previous)| (current - previous).abs() <= STOP_MERGE_MS)
                .unwrap_or(false);

            if close {
                last.push(event);
                continue;
            }
        }

        clusters.push(vec![event]);
    }

    clusters
        .into_iter()
        .map(|events| {
            let time = events
                .iter()
                .find_map(|event| event.data("StopTime").and_then(parse_event_time))
                .or_else(|| events.iter().filter_map(|event| event.time).min());

            CleanStop { events, time }
        })
        .collect()
}

fn build_planned_records(
    requests: &[RequestCluster],
    stops: &[CleanStop],
    kernel_power_events: &[&RawEvent],
) -> (Vec<PowerRecord>, Vec<PowerRecord>, Vec<PowerRecord>) {
    let mut requests_used = vec![false; requests.len()];
    let mut associated: Vec<Option<usize>> = vec![None; requests.len()];

    // Match each clean stop to the latest request that came before it. A stop
    // belongs to the request that was still active when Windows went down, not
    // to an earlier request that may have been cancelled.
    for (stop_index, stop) in stops.iter().enumerate() {
        let Some(stop_time) = stop.time else {
            continue;
        };
        let mut best: Option<(usize, i64)> = None;

        for (request_index, request) in requests.iter().enumerate() {
            if requests_used[request_index] {
                continue;
            }

            let Some(request_time) = request.time() else {
                continue;
            };
            let delta = stop_time - request_time;

            if (0..=REQUEST_STOP_WINDOW_MS).contains(&delta)
                && best
                    .map(|(_, best_delta)| delta < best_delta)
                    .unwrap_or(true)
            {
                best = Some((request_index, delta));
            }
        }

        if let Some((request_index, _)) = best {
            requests_used[request_index] = true;
            associated[request_index] = Some(stop_index);
        }
    }

    let stops_used: Vec<bool> = {
        let mut used = vec![false; stops.len()];

        for index in associated.iter().flatten() {
            used[*index] = true;
        }

        used
    };

    let mut shutdowns = Vec::new();
    let mut restarts = Vec::new();

    for (request, stop_index) in requests.iter().zip(associated.iter().copied()) {
        let stop = stop_index.map(|index| &stops[index]);
        let unclean = if stop.is_none() {
            find_unclean_after(request.time(), kernel_power_events)
        } else {
            None
        };
        let record = planned_record(request, stop, unclean);

        match request.action {
            RequestAction::Shutdown => shutdowns.push(record),
            RequestAction::Restart => restarts.push(record),
        }
    }

    let mut unclassified_stops: Vec<PowerRecord> = stops
        .iter()
        .enumerate()
        .filter(|(index, _)| !stops_used[*index])
        .map(|(_, stop)| clean_stop_record(stop))
        .collect();

    sort_records(&mut shutdowns);
    sort_records(&mut restarts);
    sort_records(&mut unclassified_stops);

    (shutdowns, restarts, unclassified_stops)
}

fn find_unclean_after(time: Option<i64>, events: &[&RawEvent]) -> Option<RawEvent> {
    let start = time?;
    let mut best: Option<&RawEvent> = None;

    for event in events {
        if let Some(event_time) = event.time {
            let delta = event_time - start;

            if (0..=REQUEST_STOP_WINDOW_MS).contains(&delta) {
                let is_earlier = best
                    .and_then(|current| current.time)
                    .map(|current_time| event_time < current_time)
                    .unwrap_or(true);

                if is_earlier {
                    best = Some(event);
                }
            }
        }
    }

    best.cloned()
}

fn planned_record(
    request: &RequestCluster,
    stop: Option<&CleanStop>,
    unclean: Option<RawEvent>,
) -> PowerRecord {
    let request_time = request.time();
    let stop_time = stop.and_then(|value| value.time);
    let confirmed = stop.is_some();
    let time = stop_time.or(request_time);
    let action_word = match request.action {
        RequestAction::Shutdown => "shutdown",
        RequestAction::Restart => "restart",
    };

    let time_note = if confirmed && stop_time.is_some() {
        let source = if stop
            .map(|value| value.events.iter().any(|event| event.event_id == 13))
            .unwrap_or(false)
        {
            "Kernel-General event 13 (StopTime)"
        } else {
            "Event Log 6006"
        };

        Some(format!("Clean stop recorded by {source}."))
    } else if confirmed {
        Some("Clean stop recorded. The stop time was not recorded.".to_string())
    } else if request_time.is_some() {
        Some("Request time. No clean stop followed within 60 minutes.".to_string())
    } else {
        Some("The request time was not recorded.".to_string())
    };

    let headline = match (request.action, confirmed) {
        (RequestAction::Shutdown, true) => "Shut down",
        (RequestAction::Restart, true) => "Restarted",
        (RequestAction::Shutdown, false) => "Shutdown requested",
        (RequestAction::Restart, false) => "Restart requested",
    };

    let detail = match (confirmed, request_time, stop_time) {
        (true, Some(start), Some(end)) => format!(
            "Windows recorded the {action_word} request, then the System log stopped cleanly {} later.",
            human_gap(end - start)
        ),
        (true, _, _) => format!(
            "Windows recorded the {action_word} request, then the System log stopped cleanly."
        ),
        (false, _, _) if unclean.is_some() => format!(
            "Windows recorded the {action_word} request, but no clean stop followed. An unexpected stop was recorded afterward."
        ),
        (false, _, _) => format!(
            "Windows recorded the {action_word} request, but no clean stop followed within 60 minutes. It may have been cancelled, or Windows did not finish the stop cleanly."
        ),
    };

    let mut facts = Vec::new();
    let initiators = unique_data(&request.events, "param1");
    let machines = unique_data(&request.events, "param2");
    let reasons = unique_data(&request.events, "param3");
    let reason_codes = unique_data(&request.events, "param4");
    let accounts = unique_data(&request.events, "param7");

    if !initiators.is_empty() {
        facts.push(fact("Requested by", initiators.join(", ")));
    }
    if !machines.is_empty() {
        facts.push(fact("Machine", machines.join(", ")));
    }
    if !reasons.is_empty() {
        facts.push(fact("Reason", reasons.join(" · ")));
    }
    if !reason_codes.is_empty() {
        facts.push(fact("Reason code", reason_codes.join(", ")));
    }
    if !accounts.is_empty() {
        facts.push(fact("Account", accounts.join(", ")));
    }

    facts.push(fact(
        "Clean stop",
        if confirmed { "Confirmed" } else { "Not recorded" },
    ));

    if let Some(unclean) = &unclean {
        facts.push(fact(
            "Unexpected stop after request",
            format!("Event 41 · record {}", unclean.record_id),
        ));
    }

    let mut events = Vec::new();

    for (index, event) in request.events.iter().enumerate() {
        events.push(event_ref(
            event,
            if index == 0 {
                "Request"
            } else {
                "Request, same stop"
            },
        ));
    }

    if let Some(stop) = stop {
        for event in &stop.events {
            events.push(event_ref(
                event,
                if event.event_id == 13 {
                    "Kernel stop time"
                } else {
                    "Event log stopped"
                },
            ));
        }
    }

    if let Some(unclean) = &unclean {
        events.push(event_ref(unclean, "Unexpected stop after request"));
    }

    let first_record = request
        .events
        .first()
        .map(|event| event.record_id)
        .unwrap_or(0);

    PowerRecord {
        id: format!(
            "request-{}-{first_record}",
            match request.action {
                RequestAction::Shutdown => "shutdown",
                RequestAction::Restart => "restart",
            }
        ),
        kind: match request.action {
            RequestAction::Shutdown => PowerKind::Shutdown,
            RequestAction::Restart => PowerKind::Restart,
        },
        time,
        time_note,
        headline: headline.to_string(),
        detail,
        severity: if confirmed || unclean.is_none() {
            PowerSeverity::Info
        } else {
            PowerSeverity::Warning
        },
        is_stop: confirmed,
        facts,
        events,
    }
}

fn clean_stop_record(stop: &CleanStop) -> PowerRecord {
    let first_record = stop
        .events
        .first()
        .map(|event| event.record_id)
        .unwrap_or(0);
    let time_note = if stop.time.is_some() {
        "Clean stop time. No shutdown or restart request was recorded.".to_string()
    } else {
        "The clean stop time was not recorded.".to_string()
    };

    PowerRecord {
        id: format!("clean-stop-{first_record}"),
        kind: PowerKind::CleanStop,
        time: stop.time,
        time_note: Some(time_note),
        headline: "Clean stop".to_string(),
        detail: "Windows stopped the System log cleanly, but no 1074 shutdown or restart request was recorded. This log does not say which one it was.".to_string(),
        severity: PowerSeverity::Info,
        is_stop: true,
        facts: Vec::new(),
        events: stop
            .events
            .iter()
            .map(|event| {
                event_ref(
                    event,
                    if event.event_id == 13 {
                        "Kernel stop time"
                    } else {
                        "Event log stopped"
                    },
                )
            })
            .collect(),
    }
}

fn build_power_offs(events: &[RawEvent]) -> Vec<PowerRecord> {
    let kernel_power: Vec<&RawEvent> = events
        .iter()
        .filter(|event| {
            event.event_id == 41
                && event
                    .provider
                    .eq_ignore_ascii_case("Microsoft-Windows-Kernel-Power")
        })
        .collect();
    let reports: Vec<&RawEvent> = events
        .iter()
        .filter(|event| {
            event.event_id == 6008 && event.provider.eq_ignore_ascii_case("EventLog")
        })
        .collect();
    let bugchecks: Vec<&RawEvent> = events
        .iter()
        .filter(|event| {
            event.event_id == 1001
                && event
                    .provider
                    .eq_ignore_ascii_case("Microsoft-Windows-WER-SystemErrorReporting")
        })
        .collect();
    let report_times: Vec<Option<i64>> = reports.iter().map(|event| event.time).collect();
    let bugcheck_times: Vec<Option<i64>> = bugchecks.iter().map(|event| event.time).collect();
    let mut reports_used = vec![false; reports.len()];
    let mut bugchecks_used = vec![false; bugchecks.len()];
    let mut records = Vec::new();

    for kernel in &kernel_power {
        let report_index = nearest_unused(
            kernel.time,
            &report_times,
            &reports_used,
            BOOT_PAIR_WINDOW_MS,
        );

        if let Some(index) = report_index {
            reports_used[index] = true;
        }

        let bugcheck_index = nearest_unused(
            kernel.time,
            &bugcheck_times,
            &bugchecks_used,
            BOOT_PAIR_WINDOW_MS,
        );

        if let Some(index) = bugcheck_index {
            bugchecks_used[index] = true;
        }

        records.push(unexpected_record(
            kernel,
            report_index.map(|index| reports[index]),
            bugcheck_index.map(|index| bugchecks[index]),
        ));
    }

    for (index, report) in reports.iter().enumerate() {
        if !reports_used[index] {
            records.push(report_only_record(report));
        }
    }

    for (index, bugcheck) in bugchecks.iter().enumerate() {
        if !bugchecks_used[index] {
            records.push(bugcheck_only_record(bugcheck));
        }
    }

    sort_records(&mut records);
    records
}

fn nearest_unused(
    anchor: Option<i64>,
    times: &[Option<i64>],
    used: &[bool],
    window: i64,
) -> Option<usize> {
    let anchor = anchor?;
    let mut best: Option<(usize, i64)> = None;

    for (index, time) in times.iter().enumerate() {
        if used[index] {
            continue;
        }

        let Some(time) = time else {
            continue;
        };
        let delta = (anchor - *time).abs();

        if delta <= window
            && best
                .map(|(_, best_delta)| delta < best_delta)
                .unwrap_or(true)
        {
            best = Some((index, delta));
        }
    }

    best.map(|(index, _)| index)
}

fn unexpected_record(
    kernel: &RawEvent,
    report: Option<&RawEvent>,
    bugcheck: Option<&RawEvent>,
) -> PowerRecord {
    let bugcheck_code = kernel
        .data("BugcheckCode")
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|code| *code != 0);
    let stop_code = bugcheck
        .and_then(|event| event.data("param1"))
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let dump_file = bugcheck
        .and_then(|event| event.data("param2"))
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let long_press = kernel
        .data("LongPowerButtonPressDetected")
        .map(|value| {
            let value = value.trim();
            value.eq_ignore_ascii_case("true") || value == "1"
        })
        .unwrap_or(false);
    let button_timestamp = kernel
        .data("PowerButtonTimestamp")
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value != 0);
    let sleep_in_progress = kernel
        .data("SleepInProgress")
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|value| value != 0);
    let previous_stop = report.and_then(previous_stop_time);
    let time = previous_stop.or(kernel.time);
    let time_note = match (previous_stop, kernel.time) {
        (Some(_), _) => Some(
            "Approximate. Event Log 6008 estimated when the previous session ended."
                .to_string(),
        ),
        (None, Some(_)) => {
            Some("Logged at the next boot. The stop time was not recorded.".to_string())
        }
        (None, None) => Some("The stop time was not recorded.".to_string()),
    };
    let code_label = stop_code
        .and_then(short_stop_code)
        .or_else(|| bugcheck_code.map(|code| format!("0x{code:X}")));
    let is_bugcheck = bugcheck_code.is_some() || stop_code.is_some();
    let headline = if let Some(code) = &code_label {
        format!("Windows stop error {code}")
    } else if long_press {
        "Power button hold".to_string()
    } else {
        "Unexpected power off".to_string()
    };
    let detail = if is_bugcheck {
        "Windows recorded a stop error in the previous session. The recorded code is below. These events do not identify the failing driver by themselves."
    } else if long_press {
        "Windows recorded a long power button press. That is physical input, not a software shutdown."
    } else if sleep_in_progress == Some(true) {
        "The stop happened during a sleep transition. Windows recorded no stop code and no power button press."
    } else {
        "Windows found no clean shutdown, no stop code, and no power button press. Power loss, a hard reset, or a protective shutdown fits this evidence."
    };
    let mut facts = Vec::new();

    if let Some(code) = bugcheck_code {
        facts.push(fact("Bugcheck code", format!("0x{code:X}")));
    }
    if let Some(code) = stop_code {
        facts.push(fact("Stop code", code));
    }
    if let Some(path) = dump_file {
        facts.push(fact("Dump file", path));
    }

    facts.push(fact(
        "Power button",
        if long_press {
            "Long press recorded"
        } else if button_timestamp.is_some() {
            "Press timestamp recorded"
        } else {
            "No press recorded"
        },
    ));

    if let Some(sleep) = sleep_in_progress {
        facts.push(fact(
            "Sleep in progress",
            if sleep { "Yes" } else { "No" },
        ));
    }

    let mut event_refs = vec![event_ref(kernel, "Kernel-Power record")];

    if let Some(report) = report {
        event_refs.push(event_ref(report, "Previous stop report"));
    }
    if let Some(bugcheck) = bugcheck {
        event_refs.push(event_ref(bugcheck, "Stop error record"));
    }

    PowerRecord {
        id: format!("kernel-power-41-{}", kernel.record_id),
        kind: if is_bugcheck {
            PowerKind::Bugcheck
        } else {
            PowerKind::UnexpectedStop
        },
        time,
        time_note,
        headline,
        detail: detail.to_string(),
        severity: PowerSeverity::Critical,
        is_stop: true,
        facts,
        events: event_refs,
    }
}

fn report_only_record(report: &RawEvent) -> PowerRecord {
    let previous_stop = previous_stop_time(report);
    let time = previous_stop.or(report.time);
    let time_note = match (previous_stop, report.time) {
        (Some(_), _) => Some(
            "Approximate. Event Log 6008 estimated when the previous session ended."
                .to_string(),
        ),
        (None, Some(_)) => {
            Some("Logged at the next boot. The stop time was not recorded.".to_string())
        }
        (None, None) => Some("The stop time was not recorded.".to_string()),
    };

    PowerRecord {
        id: format!("unexpected-6008-{}", report.record_id),
        kind: PowerKind::UnexpectedStop,
        time,
        time_note,
        headline: "Unexpected shutdown".to_string(),
        detail: "The previous session ended without a clean shutdown. No Kernel-Power 41 event was found near this report.".to_string(),
        severity: PowerSeverity::Warning,
        is_stop: true,
        facts: Vec::new(),
        events: vec![event_ref(report, "Previous stop report")],
    }
}

fn bugcheck_only_record(bugcheck: &RawEvent) -> PowerRecord {
    let stop_code = bugcheck
        .data("param1")
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let dump_file = bugcheck
        .data("param2")
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let code_label = stop_code.and_then(short_stop_code);
    let headline = code_label
        .map(|code| format!("Windows stop error {code}"))
        .unwrap_or_else(|| "Windows stop error".to_string());
    let mut facts = Vec::new();

    if let Some(code) = stop_code {
        facts.push(fact("Stop code", code));
    }
    if let Some(path) = dump_file {
        facts.push(fact("Dump file", path));
    }

    PowerRecord {
        id: format!("bugcheck-1001-{}", bugcheck.record_id),
        kind: PowerKind::Bugcheck,
        time: bugcheck.time,
        time_note: Some(
            "Logged after the next boot. The stop time was not recorded.".to_string(),
        ),
        headline,
        detail: "Windows recorded a stop error after a restart. No Kernel-Power 41 event was found near this record.".to_string(),
        severity: PowerSeverity::Critical,
        is_stop: true,
        facts,
        events: vec![event_ref(bugcheck, "Stop error record")],
    }
}

fn short_stop_code(value: &str) -> Option<String> {
    let token = value.split_whitespace().next()?.trim();

    if token.starts_with("0x") || token.starts_with("0X") {
        Some(token.to_string())
    } else {
        None
    }
}

fn unique_data(events: &[RawEvent], key: &str) -> Vec<String> {
    let mut values: Vec<String> = Vec::new();

    for event in events {
        if let Some(value) = event.data(key) {
            let value = value.trim();

            if !value.is_empty() && !values.iter().any(|existing| existing == value) {
                values.push(value.to_string());
            }
        }
    }

    values
}

fn fact(label: &str, value: impl Into<String>) -> PowerFact {
    PowerFact {
        label: label.to_string(),
        value: value.into(),
    }
}

fn event_ref(event: &RawEvent, role: &str) -> PowerEvent {
    PowerEvent {
        event_id: event.event_id,
        provider: event.provider.clone(),
        record_id: event.record_id,
        time: event.time,
        role: role.to_string(),
    }
}

fn sort_records(records: &mut [PowerRecord]) {
    records.sort_by(|left, right| match (left.time, right.time) {
        (Some(left_time), Some(right_time)) => right_time.cmp(&left_time),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left.id.cmp(&right.id),
    });
}

fn human_gap(milliseconds: i64) -> String {
    let seconds = (milliseconds.max(0) + 500) / 1_000;

    match seconds {
        0 | 1 => "1 second".to_string(),
        2..=59 => format!("{seconds} seconds"),
        60..=119 => "1 minute".to_string(),
        120..=3_599 => format!("{} minutes", seconds / 60),
        _ => {
            let hours = seconds / 3_600;
            let minutes = (seconds % 3_600) / 60;

            match (hours, minutes) {
                (1, 0) => "1 hour".to_string(),
                (1, _) => format!("1 hour {minutes} min"),
                (_, 0) => format!("{hours} hours"),
                (_, _) => format!("{hours} h {minutes} min"),
            }
        }
    }
}
