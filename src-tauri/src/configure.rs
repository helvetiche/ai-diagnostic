use std::process::Command;

use serde::{Deserialize, Serialize};

use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_WRITE};
use winreg::RegKey;

const FAST_STARTUP_KEY: &str = r"SYSTEM\CurrentControlSet\Control\Session Manager\Power";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerPlan {
    pub guid: String,
    pub name: String,
    pub active: bool,
}

fn run_powercfg(args: &[&str]) -> Result<String, String> {
    let output = Command::new("powercfg")
        .args(args)
        .output()
        .map_err(|error| format!("Windows could not run powercfg: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if detail.is_empty() {
            "powercfg failed.".to_string()
        } else {
            detail
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn valid_guid(value: &str) -> bool {
    value.len() == 36
        && value.chars().all(|character| {
            character.is_ascii_hexdigit() || character == '-'
        })
        && value.chars().filter(|character| *character == '-').count() == 4
}

fn plan_name(line: &str) -> Option<String> {
    let start = line.find('(')?;
    let end = line.rfind(')')?;
    if end <= start {
        return None;
    }

    Some(line[start + 1..end].trim().to_string())
}

fn parse_plans(output: &str) -> Vec<PowerPlan> {
    let mut plans = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();

        if !trimmed.starts_with("Power Scheme GUID:") {
            continue;
        }

        let after_label = trimmed.trim_start_matches("Power Scheme GUID:").trim();
        let mut tokens = after_label.split_whitespace();
        let Some(guid) = tokens.next() else {
            continue;
        };

        if !valid_guid(guid) {
            continue;
        }

        let Some(name) = plan_name(trimmed) else {
            continue;
        };

        let active = trimmed.ends_with('*') || trimmed.contains(") *");

        plans.push(PowerPlan {
            guid: guid.to_string(),
            name,
            active,
        });
    }

    plans
}

fn active_guid_from_output(output: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim();

        if !trimmed.starts_with("Power Scheme GUID:") {
            continue;
        }

        let after_label = trimmed.trim_start_matches("Power Scheme GUID:").trim();
        let guid = after_label.split_whitespace().next()?;

        if valid_guid(guid) {
            return Some(guid.to_string());
        }
    }

    None
}

#[tauri::command]
pub async fn list_power_plans() -> Result<Vec<PowerPlan>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = run_powercfg(&["/list"])?;
        let mut plans = parse_plans(&output);

        // Keep the active marker authoritative even if /list omits the star.
        if let Ok(active_output) = run_powercfg(&["/getactivescheme"]) {
            if let Some(active_guid) = active_guid_from_output(&active_output) {
                for plan in &mut plans {
                    plan.active = plan.guid.eq_ignore_ascii_case(&active_guid);
                }
            }
        }

        if plans.is_empty() {
            return Err("Windows did not report any power plans.".to_string());
        }

        Ok(plans)
    })
    .await
    .map_err(|error| format!("Power plan task failed: {error}"))?
}

#[tauri::command]
pub async fn set_power_plan(guid: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_guid(&guid) {
            return Err("Invalid power plan GUID.".to_string());
        }

        run_powercfg(&["/setactive", &guid])?;

        let active_output = run_powercfg(&["/getactivescheme"])?;
        let active_guid = active_guid_from_output(&active_output)
            .ok_or_else(|| "Windows did not report the active power plan.".to_string())?;

        if !active_guid.eq_ignore_ascii_case(&guid) {
            return Err(format!(
                "Windows did not switch to the requested plan. Active plan is {active_guid}."
            ));
        }

        Ok(())
    })
    .await
    .map_err(|error| format!("Power plan task failed: {error}"))?
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerTimeouts {
    pub monitor_ac: u32,
    pub monitor_dc: u32,
    pub disk_ac: u32,
    pub disk_dc: u32,
    pub standby_ac: u32,
    pub standby_dc: u32,
    pub hibernate_ac: u32,
    pub hibernate_dc: u32,
}

fn seconds_to_minutes(seconds: u32) -> u32 {
    (seconds + 30) / 60
}

fn query_timeout(subgroup: &str, setting: &str) -> Result<(u32, u32), String> {
    let output = run_powercfg(&["/query", "SCHEME_CURRENT", subgroup, setting])?;

    let mut ac = None;
    let mut dc = None;

    for line in output.lines() {
        let trimmed = line.trim();

        if let Some(value) = trimmed.strip_prefix("Current AC Power Setting Index:") {
            ac = parse_hex_index(value.trim());
        } else if let Some(value) = trimmed.strip_prefix("Current DC Power Setting Index:") {
            dc = parse_hex_index(value.trim());
        }
    }

    let ac = ac.ok_or_else(|| format!("Windows did not report the AC value for {setting}."))?;
    let dc = dc.ok_or_else(|| format!("Windows did not report the DC value for {setting}."))?;

    Ok((seconds_to_minutes(ac), seconds_to_minutes(dc)))
}

fn parse_hex_index(value: &str) -> Option<u32> {
    let value = value.trim();
    let hex = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))?;
    u32::from_str_radix(hex, 16).ok()
}

fn validate_timeout(value: u32, name: &str) -> Result<(), String> {
    if value > 10_000 {
        return Err(format!("{name} must be 10,000 minutes or less."));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_power_timeouts() -> Result<PowerTimeouts, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (monitor_ac, monitor_dc) = query_timeout("SUB_VIDEO", "VIDEOIDLE")?;
        let (disk_ac, disk_dc) = query_timeout("SUB_DISK", "DISKIDLE")?;
        let (standby_ac, standby_dc) = query_timeout("SUB_SLEEP", "STANDBYIDLE")?;
        let (hibernate_ac, hibernate_dc) = query_timeout("SUB_SLEEP", "HIBERNATEIDLE")?;

        Ok(PowerTimeouts {
            monitor_ac,
            monitor_dc,
            disk_ac,
            disk_dc,
            standby_ac,
            standby_dc,
            hibernate_ac,
            hibernate_dc,
        })
    })
    .await
    .map_err(|error| format!("Power timeout task failed: {error}"))?
}

#[tauri::command]
pub async fn set_power_timeouts(timeouts: PowerTimeouts) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_timeout(timeouts.monitor_ac, "Display off (plugged in)")?;
        validate_timeout(timeouts.monitor_dc, "Display off (on battery)")?;
        validate_timeout(timeouts.disk_ac, "Disk off (plugged in)")?;
        validate_timeout(timeouts.disk_dc, "Disk off (on battery)")?;
        validate_timeout(timeouts.standby_ac, "Sleep (plugged in)")?;
        validate_timeout(timeouts.standby_dc, "Sleep (on battery)")?;
        validate_timeout(timeouts.hibernate_ac, "Hibernate (plugged in)")?;
        validate_timeout(timeouts.hibernate_dc, "Hibernate (on battery)")?;

        run_powercfg(&["/change", "monitor-timeout-ac", &timeouts.monitor_ac.to_string()])?;
        run_powercfg(&["/change", "monitor-timeout-dc", &timeouts.monitor_dc.to_string()])?;
        run_powercfg(&["/change", "disk-timeout-ac", &timeouts.disk_ac.to_string()])?;
        run_powercfg(&["/change", "disk-timeout-dc", &timeouts.disk_dc.to_string()])?;
        run_powercfg(&["/change", "standby-timeout-ac", &timeouts.standby_ac.to_string()])?;
        run_powercfg(&["/change", "standby-timeout-dc", &timeouts.standby_dc.to_string()])?;
        run_powercfg(&["/change", "hibernate-timeout-ac", &timeouts.hibernate_ac.to_string()])?;
        run_powercfg(&["/change", "hibernate-timeout-dc", &timeouts.hibernate_dc.to_string()])?;

        Ok(())
    })
    .await
    .map_err(|error| format!("Power timeout task failed: {error}"))?
}

fn read_fast_startup() -> Option<bool> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(FAST_STARTUP_KEY).ok()?;
    let value: u32 = key.get_value("HiberbootEnabled").ok()?;
    Some(value != 0)
}

#[tauri::command]
pub async fn get_fast_startup() -> Result<Option<bool>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(read_fast_startup()))
        .await
        .map_err(|error| format!("Fast Startup task failed: {error}"))?
}

#[tauri::command]
pub async fn set_fast_startup(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let key = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags(FAST_STARTUP_KEY, KEY_WRITE)
            .or_else(|_| {
                RegKey::predef(HKEY_LOCAL_MACHINE)
                    .create_subkey(FAST_STARTUP_KEY)
                    .map(|(created, _)| created)
                    .map_err(|error| error)
            })
            .map_err(|error| format!("Windows could not open the Power key: {error}"))?;

        key.set_value("HiberbootEnabled", &(if enabled { 1u32 } else { 0u32 }))
            .map_err(|error| format!("Windows could not update Fast Startup: {error}"))?;

        Ok(())
    })
    .await
    .map_err(|error| format!("Fast Startup task failed: {error}"))?
}