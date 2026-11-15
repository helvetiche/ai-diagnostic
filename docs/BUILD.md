# Windog build plan

Status: draft. This file is the working contract for what gets built, in what
order. Update it before starting a new screen. Nothing here overrides
[DESIGN.md](DESIGN.md); it only lists scope.

Target for the first pass: the M0 slice from [BRAINSTORM.md](BRAINSTORM.md).
1 domain (performance), read-only probes, tech mode, no fixes.

## Platform scope

- Windows only. No macOS or Linux paths, no `cfg` branching. Rust code may use the
  Windows counters directly.

## Ground rules

- Build one screen at a time, only after it is listed here and approved.
- No backend yet. All probe output is fixture data and labeled as demo on screen.
- No probe, action, or number may look real if it is not.
- Add a shadcn component only when the screen being built needs it.
- Every screen ships empty, loading, and error states.
- Every new token goes into `src/index.css` first, never a one-off class.

## Screens

Order matters. Each screen is usable on its own before the next one starts.

### 1. App shell

The frame every screen sits in.

- Single window with a left rail. The rail starts with one item: Resource Graph.
- Rail: wordmark, one nav item, no icons on the right, no collapse until there
  is a second item.
- Header: wordmark, current machine label, mode switch (Employee / Tech).
- Mode switch is a segmented control, not a dropdown.
- Main region is a centered column, max width around 880px, page padding 24 to 32.
- Footer holds the privacy line: "Nothing leaves this PC unless you click Export."
- No navigation chrome until there is a second destination.

### 2. Home, symptom picker

The entry point. One question on screen: "What is happening?"

- Five choices with Phosphor icons: Slow, Won't connect, Crashing, Can't log in,
  Something else.
- Each choice is a tonal card, no border, square corners, hover lifts tone.
- Only Slow is wired in M0. The others are visible and marked "Coming next",
  disabled with a tooltip reason.
- Secondary action: "Run full scan" in tech mode only.
- Machine identity line: hostname, user, Windows build, elevation state.

### 3. Scan in progress

Shows what is running and lets the tech cancel.

- Probe name, domain, elapsed time, and a thin progress bar.
- Completed probes collapse into a short list. Failed probes stay visible.
- Cancel stops the run and keeps partial results, marked as partial.
- No spinner-only state. The list is the progress.
- Duration and timings come from fixtures, labeled as demo.

### 4. Findings, tech mode

The ranked differential diagnosis. This is the product.

- Sorted by severity, then confidence. Each row: severity mark, title, one-line
  summary, confidence, and rule id in mono.
- Rows are separated by a single hairline, never boxed cards.
- Above the list: a one-line run summary (probes run, failures, duration).
- Filter chips: All, Critical, Warning, Info. Multi-select is out of scope.
- Empty state says no rule fired and shows what would raise coverage.

### 5. Finding detail

Evidence for and against, plus the recommendation.

- Header: title, severity, confidence, rule id.
- Plain-language summary, then "Why this fired" with the rule's inputs.
- Evidence list grouped by probe. Values in mono, copyable.
- Related findings as links, no borders.
- Recommendation block: steps, risk tier, reversible flag.
- M0 shows steps only. No action buttons until the remediation framework exists.

### 6. Employee mode

The same findings, simplified.

- One sentence per finding, one next step.
- Three states only: good, needs attention, needs a tech.
- No confidence numbers, rule ids, or raw evidence.
- Toggling modes keeps the same run, no rescan.

### 7. Thermal monitor

Live CPU and GPU temperatures, built as a real-data screen.

- Dedicated Thermals destination plus a compact thermal summary on Resource
  Graph. Both read the same Rust sample stream.
- CPU sensors are tiered. ACPI thermal zones are the honest fallback. When the
  separately installed PawnIO driver is present, use Intel package/core MSRs or
  AMD Tctl/Tdie SMN instead, and say so on screen.
- GPU sensors use NVML for NVIDIA and ADL for AMD. An adapter with no public
  temperature API is listed with an unavailable state, never an invented number.
- Every reading names its source. The screen includes a sensor-access panel with
  the active method, PawnIO version, and fallback reason.
- Installing PawnIO while the app is open must be recoverable with "Check again";
  no restart.
- 2 s cadence, 10 minute in-memory history. Pauses with the resource sampler.
- PawnIO modules are bundled with their LGPL notice. The driver is not embedded
  in the app. The Windows installer may offer the official driver as an explicit
  optional prerequisite.

### 8. Power monitor

Uptime, shutdowns, restarts, and unexpected stops, built as a real-data screen
with four internal tabs.

- Dedicated Power destination. Separate tabs keep planned stops apart from
  faults: Uptime, Shutdowns, Restarts, Power offs.
- Read the live Windows System log on demand through the native Event Log API.
  Query event IDs 13, 41, 1001, 1074, 6006, and 6008. No local history is stored
  in this pass.
- Planned shutdown and restart come from event 1074 (`param5` is `power off` or
  `restart`). Merge requests of the same type within 10 seconds, then match each
  clean stop to the latest request before it within 60 minutes.
- A request without a clean stop stays visible as unconfirmed. A clean stop with
  no request is listed separately and never labeled as a shutdown or restart
  when the log does not say which one it was.
- Unexpected stop comes from Kernel-Power 41 plus Event Log 6008. Pair them at
  the next boot. The 6008 binary field carries the previous stop as a local
  SYSTEMTIME; show it as approximate. If it is missing, show the 41 event time as
  a next-boot time, not as the stop time.
- A non-zero `BugcheckCode` on event 41, or a stop-code report from event 1001,
  classifies the record as a Windows stop error. Power-button and sleep fields
  from event 41 are shown as facts, never turned into a cause.
- Uptime uses the wall clock since boot, which includes sleep. Active time uses
  `QueryUnbiasedInterruptTime` and excludes sleep. Show both, plus the
  difference as sleep time.
- Show Fast Startup state and its caveat. A hybrid shutdown can make uptime look
  longer than the time since physical power-on, so stop events are the source for
  power-off timing. A hybrid shutdown also hibernates the kernel session instead
  of stopping services, so it can skip the event 13 and 6006 clean-stop records.
  Never treat a shutdown request without a clean stop as a fault on its own.
- Show System log coverage: retained record count, file size, oldest record time,
  and a warning when earlier records are missing. Mark the 500-event query cap.
  Never imply the retained log is complete when it is not.
- Every record lists its Windows evidence: provider, event ID, record ID, and
  event time. Missing or approximate times are labeled in place.

## PawnIO installation and packaging

Current state: Windog bundles the signed LGPL sensor modules, but not the PawnIO
driver. Users install the driver separately. The in-app Sensor access panel
shows whether it is installed and keeps the official link copyable. "Check again"
re-detects sensors without restarting.

A machine with no PawnIO driver and no readable ACPI thermal zone has no CPU
temperature. That is an honest unavailable state, not a bug. GPU temperatures do
not require PawnIO; they depend on the NVIDIA or AMD graphics driver.

### Decision

Add PawnIO as an explicit optional component in the Windows installer wizard.
Do not install a kernel driver silently on first app launch.

- Internal or fleet builds: default the checkbox to checked.
- Public builds: default it to unchecked, with a clear explanation.
- If the user skips it, or the driver install fails, Windog still installs.
  CPU temperature stays unavailable when ACPI cannot provide a zone.
- Keep the in-app install and recheck path so users can add it later.

### Wizard behavior

- Label the option "CPU temperature sensors (recommended)" and say that PawnIO
  adds Intel package/core or AMD Tdie readings.
- State that GPU temperatures do not need it.
- Detect an existing PawnIO install first and skip it rather than downgrade.
- Run the official PawnIO installer from the elevated, per-machine installer.
  The known silent flags are `-install -silent`; verify them against the pinned
  release before shipping.
- Verify the installer signature or hash before running it.
- Treat exit code 0 as success. Handle 3010 as installed with restart required
  if the pinned installer uses it. Any other code should leave the app installed
  and show the manual download link.
- Do not remove PawnIO when Windog is uninstalled. It is a shared driver and
  other tools may use it.

### Technical route

Tauri's stock NSIS hooks can run an install action, but they do not add a wizard
page. A real checkbox page needs a custom NSIS template using `nsDialogs`.
Set the NSIS install mode to per-machine because the driver needs administrator
access. The app manifest already requires administrator access at runtime.

Use the official installer, never a copied `.sys` file. Pin one PawnIO version
in the build, record its hash, and keep it matched with the bundled modules.

An in-app install action is the fallback for users who skip the wizard. It
should use the same verified installer or open the official download page.

### Licensing and security

PawnIO is GPL-2.0-or-later with a special exception. The sensor modules are
LGPL-2.1-or-later. Redistributing the official installer brings GPL obligations,
including license and source availability. Confirm redistribution with the
PawnIO author if Windog is proprietary or commercial. The current
`src-tauri/resources/pawnio/NOTICE.md` covers the modules only; add a driver
notice and the GPL text when the driver installer is packaged.

Kernel driver installation may trigger antivirus, SmartScreen, or EDR prompts.
The wizard must make the install explicit and keep a manual fallback. Do not
auto-update the driver without asking.

### Acceptance checks

- Clean VM without PawnIO: skipping the checkbox installs Windog; CPU shows
  unavailable when there is no ACPI zone.
- Clean VM without PawnIO: checking the box installs the driver and the first
  sample uses Intel MSR or AMD SMN.
- Existing PawnIO install is detected and not downgraded.
- Installer failure still leaves a working Windog install with a download link.
- Uninstalling Windog leaves PawnIO installed.
- The driver notice, GPL text, and source link ship with the installer.

## Screens explicitly out of scope for this pass

- Export and evidence pack (M2)
- Fix actions, dry-run, rollback, audit log (M3)
- Baseline and diff (M5)
- History, settings, onboarding, update flow
- Any AI explanation surface

## Data shapes to settle before screen 4

- `Probe`: id, label, domain, requiresAdmin, timeout
- `Evidence`: id, probeId, label, value, observedAt
- `Finding`: id, ruleId, severity, confidence, title, summary, evidenceIds,
  relatedIds, symptomTags
- `Recommendation`: findingId, steps, riskTier, reversible

Types land in `src/types/` when the first screen that reads them is built.
Fixtures land in `src/fixtures/` and are imported by the scan screen only.

## Motion budget

- Mode switch and filter chips: 120ms crossfade.
- Screen change: 180ms fade plus 4px rise, no slide.
- Progress bar width: linear, matched to the fixture timeline.
- Detail panel: 180ms expand, no bounce.
- Nothing loops except the active probe bar while a scan runs.

## Definition of done per screen

- `npm run check` and `npm run build` pass.
- Keyboard path works end to end, focus ring visible.
- Empty, loading, and error states reachable and reviewed.
- Light and dark both checked at 1440 and 1024 wide.
- No border added anywhere outside the three allowed cases.
- Demo data labeled on screen.

## Open questions blocking the build

1. Does the first pass run against fixture data only, or should the Tauri Rust
   side return real performance counters now? Resolved for Resource Graph: real counters from sysinfo (GetSystemTimes,
    GlobalMemoryStatusEx, GetDiskFreeSpaceEx, GetIfTable2). Other screens still
    use fixtures.
2. Home start: does the user pick a symptom first, or does the app land on a
   prepared scan the tech triggers?
3. Is the machine identity line real (from Tauri) or fixture for this pass?
