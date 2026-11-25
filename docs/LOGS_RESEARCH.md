# Logs system research

Research for a new "Logs" destination in Windog: a general, on-demand view of
everything Windows records about the machine's hardware and software health,
safety, and stability. Windows-only, read-only, evidence-first, consistent
with `DESIGN.md` and `BUILD.md`.

Scope of this document: what data exists, where it lives, how to read it from
Rust, and what a first "Logs" slice should cover. It is research only; no
code changes are proposed beyond the data inventory.

## 1. Sources of truth on Windows

| Source                                                                                                               | What it gives                                                                                                        | Access from Rust                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Windows Event Log (System, Application, Security, Setup, and `Applications and Services Logs`)                       | Boot/shutdown, crashes, disk errors, service failures, updates, WHEA hardware errors, driver loads, Defender, Sysmon | `EvtQuery` / `EvtRender` (already used in `power.rs`)     |
| WMI / CIM (`root\cimv2`, `root\wmi`, `root\Microsoft\Windows\Storage`, `root\SecurityCenter2`, `root\StandardCimv2`) | Hardware inventory, SMART verdict, storage counters, battery, OS/patches, devices, network, security products        | `wmi` crate (already a dependency) or `windows` crate COM |
| Registry (`HKLM`, `HKCU`)                                                                                            | Fast Startup, power settings, installed software (uninstall keys), services, drivers                                 | `winreg` crate (already a dependency)                     |
| Performance counters (PDH / `Win32_PerfFormattedData_*`)                                                             | Live CPU/memory/disk/network rates                                                                                   | `windows` crate PDH or sysinfo                            |
| Native APIs                                                                                                          | Uptime, memory, disk space, firmware, Secure Boot, TPM, battery                                                      | `windows` crate features                                  |
| File system                                                                                                          | Minidumps, WER reports, CBS logs, setup logs, driver store                                                           | `std::fs` reads                                           |
| Sysmon (optional, installed separately)                                                                              | Process/network/DNS/registry telemetry                                                                               | Event Log channel `Microsoft-Windows-Sysmon/Operational`  |

Rule of thumb: Event Log for _history_, WMI for _current state_, Registry for
_configuration_, native APIs for _live values_. A "Logs" screen should merge
these into one timeline plus a health summary, never invent a value.

## 2. Event Log: channels and event IDs that matter

### 2.1 System log (already read in `power.rs`)

Boot and power (extend the existing Power screen, do not duplicate):

- `12` Kernel-General: OS started (system time)
- `13` Kernel-General: OS shutting down
- `41` Kernel-Power: rebooted without clean shutdown
- `1001` WER-SystemErrorReporting / BugCheck: BSOD with stop code
- `6005` EventLog: log service started (boot)
- `6006` EventLog: clean shutdown
- `6008` EventLog: previous shutdown unexpected
- `6009` EventLog: Windows version line
- `6013` EventLog: daily uptime
- `1074` User32: shutdown/restart requested (process, user, reason)

Hardware (WHEA-Logger, hardware-generated, near-zero false positives):

- `1` WHEA-Logger: fatal hardware error (machine check exception)
- `17` WHEA-Logger: corrected hardware error (recoverable, watch trend)
- `18` WHEA-Logger: fatal machine check exception
- `19` WHEA-Logger: correctable hardware error

Disk and storage:

- `7` disk: bad block / I/O failure
- `11` disk / controller: controller error (cable, HBA)
- `15` disk: device not ready
- `51` disk: paging operation error (often noise on removable media; treat as signal only on fixed disks with corroboration)
- `52` disk: predictive failure (SMART warning)
- `55` Ntfs: file system structure corrupt (`chkdsk`)
- `98` Ntfs: volume flagged dirty
- `129` storahci / storport: reset to device (disk stopped answering)
- `140` Ntfs: failed to flush transaction log
- `153` disk: I/O retried
- `2013` srv: disk at or near capacity

Services and drivers:

- `219` Kernel-PnP: driver failed to load
- `7000` Service Control Manager: service failed to start
- `7009` SCM: timed out connecting to service
- `7011` SCM: service did not answer in time
- `7031` SCM: service terminated unexpectedly (recovery action follows)
- `7034` SCM: service terminated unexpectedly (no recovery)
- `7036` SCM: service entered running/stopped
- `7045` SCM: new service installed (high signal for intrusion or deployments)

Applications and updates:

- `1000` Application Error: application crashed (module + offset)
- `1002` Application Hang: stopped responding
- `1026` .NET Runtime: unhandled exception
- `1001` Windows Error Reporting: crash bucket
- `19` WindowsUpdateClient: installation succeeded
- `20` WindowsUpdateClient: installation failed (error code)
- `43` WindowsUpdateClient: installation started
- `44` WindowsUpdateClient: download started
- `903` / `904` Application-Experience/Program-Inventory: new application installed
- `905` / `906` Program-Inventory: application updated
- `907` / `908` Program-Inventory: application removed
- `800` Program-Inventory: daily summary of software activity
- `1022` / `1033` MsiInstaller: MSI installed
- `2` Servicing: update package installed

Security (System + Application):

- `4624` Security: successful logon
- `4625` Security: failed logon
- `4648` Security: logon with explicit credentials
- `4672` Security: special privileges assigned
- `4688` Security: process creation (if auditing enabled)
- `4698` / `4699` Security: scheduled task created/deleted
- `4720` / `4726` Security: user account created/deleted
- `4732` / `4733` Security: member added/removed from local group
- `1102` Security: audit log cleared
- `4657` Security: registry value modified (if auditing enabled)
- Defender: `1000`/`1001`/`1002` (Application log, `WinDefend`/`Microsoft-Windows-Windows Defender`) for scan results, definitions, real-time protection
- Firewall: `2003`/`2004` (mpssvc) profile changes
- BitLocker: `24584`/`24592`/`24620` (Microsoft-Windows-BitLocker-Driver) status

Optional high-fidelity (only if installed):

- Sysmon `Microsoft-Windows-Sysmon/Operational`: process create (1), network connect (3), driver load (6), image load (7), create remote thread (8), process tampering (25), registry (12-14), DNS query (22). High volume; opt-in and filtered.

### 2.2 Application log

- `1000` Application Error, `1002` Application Hang, `1001` WER, `1026` .NET.
- MSI installer events.

### 2.3 Setup log

- Servicing stack events, feature updates, CBS (Component Based Servicing) failures.

### 2.4 Security log (requires admin; noisy; opt-in)

- Logon events, privilege use, account changes, policy changes, audit log cleared.

## 3. Hardware inventory and health (WMI / native)

### 3.1 Machine identity

- `Win32_ComputerSystem`: name, manufacturer, model, total physical memory, number of processors, PC system type (desktop/laptop/server)
- `Win32_SystemEnclosure`: chassis type, serial number, SMBIOS asset tag
- `Win32_BIOS`: version, release date, manufacturer
- `Win32_ComputerSystemProduct`: UUID, vendor, version
- `Win32_BaseBoard`: manufacturer, product, serial number
- `Win32_OperatingSystem`: caption, version, build, install date, last boot, free physical memory, free virtual memory

### 3.2 CPU

- `Win32_Processor`: name, manufacturer, max clock speed, number of cores/threads, load percentage, L2/L3 cache, socket
- Existing thermal module already covers ACPI / PawnIO / NVML / ADL sensors (see `thermal/`).

### 3.3 Memory

- `Win32_PhysicalMemory`: capacity, speed, manufacturer, part number, configured voltage, memory type, bank label
- `Win32_MemoryDevice`, `Win32_MemoryArray`
- Live free/used via sysinfo (already in Resource Graph)

### 3.4 Storage

- `Win32_DiskDrive`: model, size, interface type, media type, serial number, partitions, status
- `MSFT_PhysicalDisk` / `MSFT_Disk` (`root\Microsoft\Windows\Storage`): friendly name, media type, bus type, health status, operational status, size
- `MSFT_StorageReliabilityCounter`: temperature, power-on hours, wear %, read/write errors (corrected/total/uncorrected), max latency
- `MSStorageDriver_FailurePredictStatus` (`root\wmi`): SMART predictive failure flag + reason code
- Partitions/volumes: `Win32_DiskPartition`, `Win32_LogicalDisk`, `MSFT_Volume` (free space, file system, dirty bit)
- Existing Resource Graph already reports disk free space.

### 3.5 GPU

- `Win32_VideoController`: name, driver version, adapter RAM (capped at 4 GB; read registry for real value), status, video processor
- Thermal module covers NVML/ADL temperatures.

### 3.6 Network adapters

- `Win32_NetworkAdapter` (PhysicalAdapter = true): name, MAC, speed, manufacturer, status, GUID
- `Win32_NetworkAdapterConfiguration`: IP, DHCP, DNS, gateway, WINS
- `root\StandardCimv2` `MSFT_NetAdapter`: more detail on Windows 8+
- `MSNdis_LinkSpeed`, `MSNdis_PhysicalMediumType` (`root\wmi`)

### 3.7 Displays / peripherals

- `Win32_DesktopMonitor`, `WmiMonitorID`, `WmiMonitorBasicDisplayParams` (`root\wmi`)
- `Win32_USBController`, `Win32_PnPEntity` (bad devices via ConfigManagerErrorCode <> 0)
- `Win32_SoundDevice`, `Win32_Printer`, `Win32_PointingDevice`, `Win32_Keyboard`, `Win32_CDROMDrive`, `Win32_Battery`

### 3.8 Battery (laptops / UPS)

- `Win32_Battery`: design capacity, full charge capacity, estimated charge remaining, battery status, chemistry, estimated run time
- Health heuristic: full charge capacity / design capacity (end of life near 80%)
- `powercfg /batteryreport` (could shell out) for cycle count and history

### 3.9 Firmware / boot / security features

- Secure Boot state: `Confirm-SecureBootUEFI` equivalent via `GetFirmwareEnvironmentVariable` or registry `HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State`
- TPM: `Win32_Tpm` (`root\cimv2\Security\MicrosoftTpm`) presence, spec version, enabled/activated
- UEFI vs legacy: `Win32_ComputerSystem` (BootupState, or firmware type via registry)
- Fast Startup: already read in `power.rs`

## 4. Software inventory and health

### 4.1 Installed software

- `Win32_Product` (MSI only; slow and triggers repair; avoid on hot paths; use registry uninstall keys instead)
- Registry: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` and `...\WOW6432Node\...`, plus `HKCU\...` for per-user installs
- `Win32_QuickFixEngineering`: installed hotfixes / updates
- Windows Update history: `IUpdateSearcher` COM / `Microsoft.Update.Session` (or event log IDs 19/20/43/44)
- Installed drivers: `Win32_SystemDriver`, `Win32_PnPSignedDriver` (driver version, date, signer, inf name)

### 4.2 Services and scheduled tasks

- `Win32_Service`: name, display name, state, start mode, path name, account
- Scheduled tasks: Task Scheduler COM (`ITaskService`) or `schtasks` (registry under `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache`)

### 4.3 Startup and persistence

- Startup apps: already in Configure screen (`get_startup_apps`)
- Run keys: `HKLM\...\Run`, `HKCU\...\Run`, RunOnce
- Services auto-start, WMI subscriptions, shell extensions

### 4.4 Reliability

- Reliability Monitor / RAC: `Win32_ReliabilityStabilizationSystem`? Actually stability data lives in `root\cimv2` `Win32_ReliabilityRecords` and `Win32_ReliabilityStabilizationSystem` (Windows 7+). Provides failure events with product name, failure type, time, and a 1-10 stability index trend.
- WER reports: `C:\ProgramData\Microsoft\Windows\WER\ReportQueue` and `ReportArchive`
- Minidumps: `C:\Windows\Minidump\*.dmp`, memory dump `C:\Windows\MEMORY.DMP`

### 4.5 OS configuration / activation

- Activation: `Win32_WindowsProductActivation` (legacy) or `SLMGR` / `SoftwareLicensingProduct` WMI (`root\cimv2` `SoftwareLicensingProduct` where PartialProductKey is not null)
- Uptime/active time: already in Power screen
- Time sync: `w32tm` status
- Page file, virtual memory settings

## 5. Security posture

- Windows Defender: `root\Microsoft\Windows\Defender` `MSFT_MpComputerStatus` (or `Get-MpComputerStatus`); fields: RealTimeProtectionEnabled, AntivirusEnabled, AntispywareEnabled, BehaviorMonitorEnabled, IoavProtectionEnabled, NISEnabled, OnAccessProtectionEnabled, AntivirusSignatureLastUpdated, QuickScanAge, FullScanAge
- Security Center (`root\SecurityCenter2`): `AntiVirusProduct`, `AntiSpywareProduct`, `FirewallProduct` (displayName, productState, pathToSignedProductExe)
- Firewall: `root\StandardCimv2` `MSFT_NetFirewallProfile` (enabled per profile, inbound/outbound default action) or `HNetCfg.FwPolicy2` COM
- BitLocker: `Win32_EncryptableVolume` (`root\CIMV2\Security\MicrosoftVolumeEncryption`) protection status, conversion status, encryption percentage, key protectors
- UAC level: registry `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System` (`EnableLUA`, `ConsentPromptBehaviorAdmin`)
- Secure Boot / TPM (above)
- Windows Update servicing state: `USOClient`, `WindowsUpdate` service status, pending reboot flag (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired`)
- EDR presence: detect via Security Center products + known service names (not a single API)
- Credential Guard / HVCI / VBS: registry `HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard`, `HypervisorEnforcedCodeIntegrity`
- SmartScreen, exploit protection (Windows Security Center)

## 6. Network health

- Adapter state, link speed, DHCP/DNS configuration (above)
- Connectivity: `NetworkListManager` COM, or ping gateway/DNS
- Proxy settings: `WinHttp` / IE proxy registry
- Hosts file tampering: read `C:\Windows\System32\drivers\etc\hosts`
- Wi-Fi signal: Native Wifi API (`wlanapi`) or `netsh wlan show interfaces`
- VPN clients: service/process detection

## 7. What "Logs" should be (proposed scope)

A single destination that is _not_ another live meter screen. It is the
evidence surface: a filterable, time-ordered log of important system events
plus a compact health summary. It complements Power (which is already a
specialized log view) and Thermals/Resource Graph (live).

Proposed first slice (read-only, no fixes):

1. Health summary header (one screen, no glass behind tables):
   - OS: edition, build, install date, last boot, activation status
   - Hardware: CPU model, RAM, disk health (SMART verdict + storage counters), battery health %, GPU
   - Security posture: Defender real-time protection, signature age, firewall profiles, BitLocker volumes, Secure Boot, TPM, pending reboot
   - Reliability: stability index trend (last 7/30 days), count of crashes and unexpected stops
   - Storage: free space per volume, SMART predictive failures
2. Event timeline: merged, newest-first, from System + Application (+ optional Security/Sysmon), filtered by category:
   - Crashes and hangs
   - Unexpected stops / BSODs
   - Hardware errors (WHEA, disk)
   - Service failures and new services
   - Driver load failures
   - Update install failures
   - Security events (logon failures, policy changes, audit cleared)
   - Application installs/removals
3. Device problems list (PnP entities with ConfigManagerErrorCode <> 0).
4. Installed software list (from registry uninstall keys) with version and publisher.
5. Drivers list (signed drivers) with date and signer, flagging old/unsigned.
6. Reliability records list (product, failure type, time).

## 8. Data access notes for the Rust side

- Reuse the existing `EvtQuery`/`EvtRender` machinery in `power.rs`; generalize
  it into a shared event-log reader that accepts a channel + query string +
  max events, returning `RawEvent`-style records. Do not copy-paste per screen.
- WMI: the `wmi` crate is already a dependency. Prefer CIM queries over
  `Win32_Product` (which is slow and can trigger MSI repairs). Read software
  from registry uninstall keys instead.
- Admin rights: ~40% of probes need elevation (Security log, Defender status,
  BitLocker, TPM, SMART on some controllers, WHEA). Follow the existing
  pattern: degrade gracefully, mark "needs admin", never fabricate.
- Performance: probes must be cheap and cancellable. Inventory queries
  (software, drivers) are heavy; run them on demand and cache for the session,
  not on a 1-second sampler. Event log reads are bounded (cap 500 per query,
  as in `power.rs`).
- Offline-first: no network calls. Everything local.
- Honesty: label unavailable values as unavailable, not zero. Empty storage
  counters mean "no data", not 0. A disk behind USB/RAID may report nothing.

## 9. Caveats and known gaps

- `Win32_Product` is slow and can trigger MSI self-repair; use registry.
- `Win32_VideoController.AdapterRAM` caps at 4 GB; read the registry for
  the real value on discrete GPUs.
- Storage reliability counters are not supported by all devices (USB, RAID,
  some NVMe behind certain drivers). Empty != zero.
- SMART predictive status (`MSStorageDriver_FailurePredictStatus`) is ATA/SATA
  oriented; NVMe health comes via storage counters / vendor tools.
- WHEA events are hardware-generated but only present on hardware that
  reports them (modern CPUs/chipsets).
- Reliability Monitor data (`Win32_ReliabilityRecords`) is Windows 7+ and
  may be empty on fresh installs or when the RAC task is disabled.
- Security log access requires admin and auditing policies; many events only
  appear if auditing is enabled.
- Sysmon is optional and not installed by default; detect presence before
  reading its channel.
- Event log retention: the System log wraps; "oldest record time" must be
  shown so users do not assume completeness (already done in Power screen).

## 10. Suggested build order for the Logs destination

1. Shared event-log reader (refactor out of `power.rs`) + a generic
   "Logs" command returning categorized events for System + Application.
2. Health summary backend (WMI + registry + native APIs) behind one command,
   with per-probe error reporting.
3. Frontend: Logs screen with health summary header + filterable event
   timeline + device problems + software/drivers lists.
4. Opt-in Security log and Sysmon channels behind an explicit toggle, with
   an admin-rights notice.
5. Reliability records and WER/minidump listing.

## 11. References

- Microsoft Learn, "WMI Tasks: Computer Hardware / Computer Software /
  Operating Systems" (WMI class inventory).
- Microsoft Learn, "Win32_Battery", "Win32_PnPEntity", "MSFT_StorageReliabilityCounter".
- Microsoft Learn, "Troubleshoot unexpected reboots using system event logs".
- Sophos KBA: interesting Windows event IDs for investigation.
- ggfix.dk hardware diagnostics guide: WHEA-Logger events.
- hwkeeper.com: SMART disk health on Windows.
- Microsoft PowerShell docs: `Get-StorageReliabilityCounter`.
- Sysmon events reference (Microsoft Learn).
- Windows Reliability and Performance Monitor / RAC documentation.
