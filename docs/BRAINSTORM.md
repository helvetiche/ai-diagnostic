# windog-ai — Brainstorm

Diagnostic toolkit for service desk / tech support: figure out what's wrong with an
employee's PC fast, explain it in plain language, and fix it safely.

Status: brainstorm only. No code yet.

---

## The problem

Collection tools already exist (HWInfo, Speccy, a pile of PowerShell scripts). Techs
still abandon them because:

- They produce 300 rows of data and no conclusion.
- They don't start from the user's symptom ("it's slow"), they start from hardware.
- Every ticket starts from zero — no baseline, no "what changed."
- Evidence dies with the session, so it can't be shared with L2 or a vendor.

**North star:** time from "user reports a problem" to "tech has a defensible
conclusion + evidence pack" — under 5 minutes, ideally under 2.

---

## Decisions so far

| Question   | Decision                                                               |
| ---------- | ---------------------------------------------------------------------- |
| Deployment | Portable app, run locally on the employee's PC during a remote session |
| v1 scope   | Everything, including fixes (as a destination, not a big-bang release) |
| AI         | Explain only, after deterministic rules fire                           |
| Platform   | Windows (name "windog" = Windows + watchdog)                           |

### On "runs on the machine"

Every option runs locally. The real fork is _how it arrives_:

- **Portable** — tech shares an exe, user runs it during the session. No install,
  no backend, no MDM. Chosen.
- **Agent** — installed on every PC, always-on. Needed later for baseline and
  fleet view.
- **Tech-side** — reaches over WinRM. Weakest: firewalls, credentials, slow.

Local execution is mandatory. SMART attributes, thermals, WMI counters, event
logs and driver state only exist locally.

Build one binary that can _become_ an agent: add a `--agent` mode later, don't
architect two products.

**Privacy pitch:** "Nothing leaves this PC unless you click Export."

**Known limit:** if the machine won't boot or BSODs at startup, a Windows app
can't help. Future WinPE/USB variant. Not v1.

---

## Architecture spine

```
Probe  ->  Evidence  ->  Finding  ->  Recommendation  ->  Action
```

- **Probe** — `id, domain, requiresAdmin, estCost, timeout`. Read-only,
  structured output, cheap, cancellable.
- **Evidence** — the raw artifact a finding points at. Addressable, never a
  string blob, so the report can cite it.
- **Finding** — `ruleId, severity, confidence, title, summary, evidence[],
related[], symptomTags[]`. Deterministic output of a rule.
- **Recommendation** — `findingId, steps[], autoFixActionId?, risk, reversible`.
- **Action** — `dryRun()`, `apply()`, `verify()`, `rollback()`, audit entry.

Correlate deterministically first, explain with AI after. Never let the LLM read
raw probe dumps and guess.

**Rules are declarative (YAML/JSON)**, evaluated by a Rust engine. This is what
lets "everything" be a coverage grind instead of a rewrite. Fixture in →
expected findings out, so rules are testable.

---

## Diagnostic domains

Grouped by what the desk actually gets tickets about:

- **"It's slow"** — top CPU/disk/memory consumers, startup impact, thermal
  throttling, SMART health, free space, pending updates, uptime
- **"Can't connect"** — adapter state, DHCP/DNS, gateway latency and packet
  loss, Wi-Fi signal, VPN client state, proxy/hosts tampering, captive portal
- **"It crashed / BSOD"** — WER reports, minidumps, reliability history, driver
  faults, event log digest
- **"App X won't work"** — app version, crash logs, Office/Teams/Outlook profile
  state, certificate expiry, license state
- **"I can't log in"** — account lockout, cached credentials, domain/Entra join,
  time skew
- **"My stuff doesn't work"** — printers, docks, monitors, cameras, audio, USB
- **Posture** — Defender, firewall, BitLocker, EDR presence, admin rights,
  conflicting AV

---

## Product ideas worth keeping

1. **Symptom-first, not module-first.** Home screen asks "What's happening?" —
   Slow / Won't connect / Crashing / Can't log in / Something else. Runs a
   targeted probe set, so the tech isn't waiting on 60 probes to answer
   "my Wi-Fi is dead."

2. **Differential diagnosis.** Ranked candidate causes, each with the evidence
   for and against. That ranked list _is_ the product.

3. **Two faces, one engine.** Employee mode: green/yellow/red + one sentence +
   Fix it. Tech mode: raw evidence, timings, export. Same findings.

4. **Baseline + diff.** Lightweight snapshot per machine, show what changed
   since known-good. Biggest lever for repeat users.

5. **One-click evidence pack.** Redacted zip: report, relevant log slices,
   machine fingerprint. Ready to attach to a ticket.

---

## Fixes: safety rules

This is where a diagnostic tool becomes a liability. Non-negotiables:

- **Allowlist only.** No arbitrary shell or PowerShell execution. Every action
  is a registered, reviewed unit.
- **Four-step contract:** dry-run, apply, verify, rollback. No rollback = must
  be flagged irreversible in the UI.
- **Risk tiers:**
  - **T0 safe/reversible** — flush DNS, restart spooler, clear Teams cache,
    restart Explorer, disable a startup item. One click + confirm.
  - **T1 config change** — reset network adapter, re-register Outlook, power
    plan. Confirm + dry-run shown.
  - **T2 irreversible** — SFC/DISM, driver rollback, profile rebuild. No
    button; generate a runbook, or require typed confirmation.
- **Never auto-run.** Detect → explain → recommend → confirm → act, even in
  agent mode.
- **Audit log** of every action, with before/after state. Also your defense
  when a fix makes things worse.

To prove the pipeline without waiting for coverage: **5 T0 fixes on 1 symptom**,
wired end to end. If it works for "restart print spooler," it works for 200.

---

## Things that will bite

- **Privacy/consent** — decide what is collected and what is _never_ collected
  (browsing history, documents, keystrokes) before the first probe.
- **Admin rights** — ~40% of useful probes need elevation. Decide: require
  elevation up front, or degrade gracefully and flag "needs admin"?
- **Offline-first** — broken network is a top ticket. Nothing may phone home.
- **Performance footprint** — a diagnostic tool that pegs the CPU gets blamed
  for the problem. Probes must be cheap and cancellable.
- **False positives** — a crying-wolf rules engine gets muted. Every finding
  needs confidence and a "why this fired" trace.
- **Code signing** — an unsigned diagnostic exe gets flagged by Defender and
  SmartScreen, which is deeply ironic. Figure this out early.

---

## Build ladder

- **M0** — Probe registry, findings schema, rules engine, tech-mode UI.
  1 domain (performance).
- **M1** — All read-only domains. Symptom-first routing on top.
- **M2** — Evidence pack export + employee mode.
- **M3** — Remediation framework + the 5 T0 actions. Verify, rollback, audit.
- **M4** — Coverage grind: T1 actions, more rules, declarative authoring.
- **M5** — `--agent` mode + baseline/diff + fleet view. Only if the desk wants it.

---

## Open questions

1. Does the tech run this **while screen-sharing** (employee watches and
   consents), or must it work unattended too? Decides whether we need a
   headless report-only mode from day one.
2. **Elevation story** — do employee accounts have local admin, or does the tech
   need a separate admin credential / "run as different user"? Changes behavior
   for ~40% of probes.
3. **Storage** — does the app keep history locally, or is every run stateless?
   Affects the baseline idea.
