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

#[tauri::command]
pub async fn get_display_brightness() -> Result<Option<u8>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = run_powershell(
            "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness",
        )?;

        if output.is_empty() {
            return Ok(None);
        }

        let value = output
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .parse::<u8>()
            .ok();

        Ok(value)
    })
    .await
    .map_err(|error| format!("Display brightness task failed: {error}"))?
}

#[tauri::command]
pub async fn set_display_brightness(value: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if value > 100 {
            return Err("Brightness must be between 0 and 100.".to_string());
        }

        run_powershell(&format!(
            "$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) {{ $m.WmiSetBrightness(1, {value}) | Out-Null }}"
        ))?;

        Ok(())
    })
    .await
    .map_err(|error| format!("Display brightness task failed: {error}"))?
}

#[tauri::command]
pub async fn get_game_mode() -> Result<Option<bool>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use winreg::enums::HKEY_CURRENT_USER;
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\GameBar")
            .ok();
        let Some(key) = key else { return Ok(None); };
        let value: u32 = key.get_value("AutoGameModeEnabled").ok().unwrap_or(1);
        Ok(Some(value != 0))
    })
    .await
    .map_err(|error| format!("Game Mode task failed: {error}"))?
}

#[tauri::command]
pub async fn set_game_mode(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(r"Software\Microsoft\GameBar", KEY_WRITE)
            .or_else(|_| {
                RegKey::predef(HKEY_CURRENT_USER)
                    .create_subkey(r"Software\Microsoft\GameBar")
                    .map(|(created, _)| created)
                    .map_err(|error| error)
            })
            .map_err(|error| format!("Windows could not open GameBar key: {error}"))?;

        key.set_value("AutoGameModeEnabled", &(if enabled { 1u32 } else { 0u32 }))
            .map_err(|error| format!("Windows could not update Game Mode: {error}"))?;

        Ok(())
    })
    .await
    .map_err(|error| format!("Game Mode task failed: {error}"))?
}

#[tauri::command]
pub async fn get_hags() -> Result<Option<bool>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        let key = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey(r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers")
            .ok();
        let Some(key) = key else { return Ok(None); };
        let value: u32 = key.get_value("HwSchMode").ok().unwrap_or(1);
        // 2 = on, 1 = off
        Ok(Some(value == 2))
    })
    .await
    .map_err(|error| format!("HAGS task failed: {error}"))?
}

#[tauri::command]
pub async fn set_hags(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_WRITE};
        let key = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags(r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers", KEY_WRITE)
            .map_err(|error| format!("Windows could not open GraphicsDrivers key: {error}"))?;

        key.set_value("HwSchMode", &(if enabled { 2u32 } else { 1u32 }))
            .map_err(|error| format!("Windows could not update HAGS: {error}"))?;

        Ok(())
    })
    .await
    .map_err(|error| format!("HAGS task failed: {error}"))?
}

#[tauri::command]
pub async fn get_windows_updates_paused() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = run_powershell(
            "if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings') { (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings' -Name PauseUpdatesExpiryTime -ErrorAction SilentlyContinue).PauseUpdatesExpiryTime } else { '' }",
        )?;

        Ok(!output.is_empty())
    })
    .await
    .map_err(|error| format!("Windows Update pause task failed: {error}"))?
}

#[tauri::command]
pub async fn set_windows_updates_paused(paused: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if paused {
            run_powershell(
                "$pause = (Get-Date).AddDays(35).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); $start = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); $path = 'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings'; if (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }; Set-ItemProperty -Path $path -Name 'PauseUpdatesExpiryTime' -Value $pause; Set-ItemProperty -Path $path -Name 'PauseFeatureUpdatesStartTime' -Value $start; Set-ItemProperty -Path $path -Name 'PauseFeatureUpdatesEndTime' -Value $pause; Set-ItemProperty -Path $path -Name 'PauseQualityUpdatesStartTime' -Value $start; Set-ItemProperty -Path $path -Name 'PauseQualityUpdatesEndTime' -Value $pause; Set-ItemProperty -Path $path -Name 'PauseUpdatesStartTime' -Value $start",
            )?;
        } else {
            run_powershell(
                "$path = 'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings'; foreach ($name in 'PauseUpdatesExpiryTime','PauseFeatureUpdatesStartTime','PauseFeatureUpdatesEndTime','PauseQualityUpdatesStartTime','PauseQualityUpdatesEndTime','PauseUpdatesStartTime') { Remove-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue }",
            )?;
        }

        Ok(())
    })
    .await
    .map_err(|error| format!("Windows Update pause task failed: {error}"))?
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    pub name: String,
    pub display_name: String,
    pub icon: Option<String>,
    pub scope: String,
    pub enabled: bool,
    pub command: String,
    pub kind: String,
    pub path: String,
}

#[tauri::command]
pub async fn get_startup_apps() -> Result<Vec<StartupApp>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"
$apps = @()
$sources = @(
    @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Scope = 'User' },
    @{ Path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; Scope = 'Machine' }
)
Add-Type -AssemblyName System.Drawing
foreach ($source in $sources) {
    if (-not (Test-Path $source.Path)) { continue }
    $key = Get-Item $source.Path
    foreach ($name in $key.GetValueNames()) {
        $command = [string]$key.GetValue($name)
        $exe = $command
        if ($exe.StartsWith('"')) {
            $end = $exe.IndexOf('"', 1)
            if ($end -gt 1) { $exe = $exe.Substring(1, $end - 1) }
        } else {
            $parts = $exe.Split(' ', 2)
            $exe = $parts[0]
        }
        $displayName = $name
        if (Test-Path $exe) {
            try {
                $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
                if ($info.FileDescription) { $displayName = $info.FileDescription }
                elseif ($info.ProductName) { $displayName = $info.ProductName }
                else { $displayName = [System.IO.Path]::GetFileNameWithoutExtension($exe) }
            } catch {
                $displayName = [System.IO.Path]::GetFileNameWithoutExtension($exe)
            }
        }
        $icon = $null
        if (Test-Path $exe) {
            try {
                $bmp = [System.Drawing.Icon]::ExtractAssociatedIcon($exe).ToBitmap()
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $icon = [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose()
                $bmp.Dispose()
            } catch { }
        }
        $apps += [PSCustomObject]@{
            name = $name
            displayName = $displayName
            icon = $icon
            scope = $source.Scope
            enabled = $true
            command = $command
            kind = 'registry'
            path = ''
        }
    }
}

# Disabled registry items (backed up by Windog)
$backupSources = @(
    @{ Path = 'HKCU:\Software\Windog\DisabledStartup'; Scope = 'User' },
    @{ Path = 'HKLM:\Software\Windog\DisabledStartup'; Scope = 'Machine' }
)
foreach ($source in $backupSources) {
    if (-not (Test-Path $source.Path)) { continue }
    $key = Get-Item $source.Path
    foreach ($name in $key.GetValueNames()) {
        $command = [string]$key.GetValue($name)
        $exe = $command
        if ($exe.StartsWith('"')) {
            $end = $exe.IndexOf('"', 1)
            if ($end -gt 1) { $exe = $exe.Substring(1, $end - 1) }
        } else {
            $parts = $exe.Split(' ', 2)
            $exe = $parts[0]
        }
        $displayName = $name
        if (Test-Path $exe) {
            try {
                $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
                if ($info.FileDescription) { $displayName = $info.FileDescription }
                elseif ($info.ProductName) { $displayName = $info.ProductName }
                else { $displayName = [System.IO.Path]::GetFileNameWithoutExtension($exe) }
            } catch {
                $displayName = [System.IO.Path]::GetFileNameWithoutExtension($exe)
            }
        }
        $icon = $null
        if (Test-Path $exe) {
            try {
                $bmp = [System.Drawing.Icon]::ExtractAssociatedIcon($exe).ToBitmap()
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $icon = [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose()
                $bmp.Dispose()
            } catch { }
        }
        $apps += [PSCustomObject]@{
            name = $name
            displayName = $displayName
            icon = $icon
            scope = $source.Scope
            enabled = $false
            command = $command
            kind = 'registry'
            path = ''
        }
    }
}

$folders = @(
    @{ Path = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"; Scope = 'User' },
    @{ Path = "$env:PROGRAMDATA\Microsoft\Windows\Start Menu\Programs\StartUp"; Scope = 'Machine' }
)
foreach ($folder in $folders) {
    if (-not (Test-Path $folder.Path)) { continue }
    Get-ChildItem -Path $folder.Path -File | ForEach-Object {
        $file = $_
        $enabled = $file.Extension -eq '.lnk'
        $target = $file.FullName
        if ($file.Extension -eq '.lnk') {
            try {
                $shell = New-Object -ComObject WScript.Shell
                $shortcut = $shell.CreateShortcut($file.FullName)
                if ($shortcut.TargetPath) { $target = $shortcut.TargetPath }
            } catch { }
        } else {
            # disabled shortcut: remove .disabled suffix for target resolution
            $base = $file.FullName -replace '\.disabled$',''
            if (Test-Path $base) {
                try {
                    $shell = New-Object -ComObject WScript.Shell
                    $shortcut = $shell.CreateShortcut($base)
                    if ($shortcut.TargetPath) { $target = $shortcut.TargetPath }
                } catch { }
            }
        }
        $displayName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        if ($file.Extension -eq '.lnk.disabled') {
            $displayName = $displayName -replace '\.lnk$',''
        }
        $icon = $null
        if (Test-Path $target) {
            try {
                $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($target)
                if ($info.FileDescription) { $displayName = $info.FileDescription }
                elseif ($info.ProductName) { $displayName = $info.ProductName }
            } catch { }
            try {
                $bmp = [System.Drawing.Icon]::ExtractAssociatedIcon($target).ToBitmap()
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $icon = [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose()
                $bmp.Dispose()
            } catch { }
        }
        $apps += [PSCustomObject]@{
            name = $file.Name
            displayName = $displayName
            icon = $icon
            scope = $folder.Scope
            enabled = $enabled
            command = $target
            kind = 'file'
            path = $file.FullName
        }
    }
}

$apps | ConvertTo-Json -Compress
"#;

        let output = run_powershell(script)?;
        if output.is_empty() || output == "null" {
            return Ok(Vec::new());
        }

        let parsed: Vec<StartupApp> = if output.trim_start().starts_with('[') {
            serde_json::from_str(&output).map_err(|error| format!("Could not parse startup apps: {error}"))?
        } else {
            let single: StartupApp = serde_json::from_str(&output).map_err(|error| format!("Could not parse startup apps: {error}"))?;
            vec![single]
        };

        Ok(parsed)
    })
    .await
    .map_err(|error| format!("Startup apps task failed: {error}"))?
}

#[tauri::command]
pub async fn disable_startup_app(scope: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_WRITE};

        let hive = if scope == "User" {
            HKEY_CURRENT_USER
        } else {
            HKEY_LOCAL_MACHINE
        };

        let run_key = RegKey::predef(hive)
            .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_WRITE)
            .map_err(|error| format!("Windows could not open the Run key: {error}"))?;

        let command: String = run_key
            .get_value(&name)
            .map_err(|error| format!("Windows could not read {name}: {error}"))?;

        // Back up the value so it can be restored later.
        let backup_key = RegKey::predef(hive)
            .create_subkey(r"Software\Windog\DisabledStartup")
            .map(|(key, _)| key)
            .map_err(|error| format!("Windows could not create the backup key: {error}"))?;
        backup_key
            .set_value(&name, &command)
            .map_err(|error| format!("Windows could not back up {name}: {error}"))?;

        run_key
            .delete_value(&name)
            .map_err(|error| format!("Windows could not disable {name}: {error}"))?;

        Ok(())
    })
    .await
    .map_err(|error| format!("Startup apps task failed: {error}"))?
}

#[tauri::command]
pub async fn enable_startup_app(scope: String, name: String, command: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_WRITE};

        let hive = if scope == "User" {
            HKEY_CURRENT_USER
        } else {
            HKEY_LOCAL_MACHINE
        };

        let run_key = RegKey::predef(hive)
            .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_WRITE)
            .or_else(|_| {
                RegKey::predef(hive)
                    .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
                    .map(|(created, _)| created)
                    .map_err(|error| error)
            })
            .map_err(|error| format!("Windows could not open the Run key: {error}"))?;

        // Prefer the backed-up command if present.
        let backup_value: Result<String, _> = RegKey::predef(hive)
            .open_subkey(r"Software\Windog\DisabledStartup")
            .and_then(|key| key.get_value(&name));
        let value_to_set = backup_value.unwrap_or(command);

        run_key
            .set_value(&name, &value_to_set)
            .map_err(|error| format!("Windows could not enable {name}: {error}"))?;

        // Remove the backup entry.
        if let Ok(backup_key) = RegKey::predef(hive).open_subkey_with_flags(r"Software\Windog\DisabledStartup", KEY_WRITE) {
            let _ = backup_key.delete_value(&name);
        }

        Ok(())
    })
    .await
    .map_err(|error| format!("Startup apps task failed: {error}"))?
}

#[tauri::command]
pub async fn toggle_startup_file(path: String, enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let disabled_path = if path.ends_with(".lnk.disabled") {
            path.trim_end_matches(".disabled").to_string()
        } else {
            format!("{path}.disabled")
        };

        if enabled {
            if std::path::Path::new(&disabled_path).exists() {
                std::fs::rename(&disabled_path, &path)
                    .map_err(|error| format!("Windows could not enable startup item: {error}"))?;
            }
        } else if std::path::Path::new(&path).exists() {
            std::fs::rename(&path, &disabled_path)
                .map_err(|error| format!("Windows could not disable startup item: {error}"))?;
        }

        Ok(())
    })
    .await
    .map_err(|error| format!("Startup apps task failed: {error}"))?
}