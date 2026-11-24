# AI features (planned)

These are the AI-powered capabilities we plan to add on top of the existing
diagnostic surfaces. They are intentionally listed as "soon" work; the current
UI ships the entry points (e.g. the "Ask AI" input in the reliability record
cabinet) without live behavior.

## Reliability records

- **Ask AI on a record** — contextual Q&A about the selected reliability record
  (product, message, source, time, event id). Answers cite the record's fields
  and never invent missing data.
- **Explain a crash/failure** — plain-language explanation of what the record
  means, likely causes, and what to check next.
- **Correlate records** — group related reliability records and events by
  product, source, or time window.

## Findings and diagnosis

- **Explain a finding** — expand "Why this fired" with an AI summary of the
  evidence, kept factual and tied to rule inputs.
- **Differential diagnosis assist** — suggest likely causes ranked by evidence,
  clearly labeled as suggestions, not conclusions.
- **Remediation guidance** — step-by-step fix suggestions with risk tier and
  reversibility, preview-only until the remediation framework exists.

## Logs and events

- **Natural-language search** — ask questions like "show crashes from yesterday"
  instead of filtering fields manually.
- **Anomaly highlights** — flag unusual event patterns or repeated failures.
- **Summarize a time range** — short summary of what happened in a window.

## General assistant

- **Tech assistant chat** — a side panel for technicians to ask about the
  current machine, findings, or logs.
- **Employee-facing explanations** — simplified, non-technical answers for end
  users watching the screen.

## Guardrails

- AI never invents machine stats, timings, or fix results.
- AI output is labeled as AI-generated.
- Demo data is labeled as demo data wherever it appears.
- Destructive or system-changing actions always require explicit user
  confirmation and stay preview-only until approved.
