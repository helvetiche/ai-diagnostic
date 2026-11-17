# Windog design direction

Status: active. Applies to every screen and every component.

## Design read

Reading this as: a Windows diagnostic app for service desk technicians, used while an
employee watches, in a calm utility style, dial ENERGY 1 / RHYTHM 2 / MOTION 2.

The app often delivers bad news about a PC. The interface should lower stress, not perform
urgency. Quiet graphite surfaces and one muted accent keep findings readable. Status color
is reserved for real severity, so red keeps its meaning.

## Principles

1. **Findings lead.** Values and evidence are the content. Remove copy that does not change
   how a reading is interpreted.
2. **Quiet chrome.** The top rail and hero summaries recede. Data tables and charts stay
   solid and legible.
3. **One accent.** Steel is the default. Jade, Clay, and Plum are alternate accents. Status
   colors never change with the accent.
4. **Thin, not faint.** Hairlines, light numerals, and tight spacing carry the structure.
   Body text still meets AA.
5. **Glass with a job.** Frosted layers mark chrome, a summary, or a floating control. Never
   put glass behind a dense table or chart.
6. **Honest data.** Never invent machine stats, timings, confidence, or fix results. Label
   demo data on screen.
7. **Motion explains.** Transitions show arrival or state change. Nothing pulses or floats
   forever.

## Color

The palette is cool graphite with one selectable accent. Status colors are semantic.

| Token              | Light     | Dark      | Use                                   |
| ------------------ | --------- | --------- | ------------------------------------- |
| `background`       | `#f6f7f9` | `#0e1114` | App canvas                            |
| `surface`          | `#ffffff` | `#15191e` | Panels, tables, charts                |
| `surface-raised`   | `#ffffff` | `#1a1f25` | Floating layers without glass         |
| `surface-muted`    | `#f0f2f5` | `#1b2027` | Inputs, muted rows, secondary buttons |
| `foreground`       | `#15181d` | `#e9ecf0` | Primary text                          |
| `muted-foreground` | `#5b6572` | `#98a1ad` | Secondary text                        |
| `primary`          | `#3f6284` | `#9dbdd8` | Accent, primary action                |
| `accent`           | `#e9eff5` | `#1c2833` | Selected surface                      |
| `ring`             | `#3f6284` | `#9dbdd8` | Focus ring                            |
| `success`          | `#2c6b4b` | `#86c9a6` | Healthy state                         |
| `warning`          | `#7a5312` | `#d9ac6b` | Attention, degraded                   |
| `critical`         | `#8f3b34` | `#e39289` | Failing, urgent                       |
| `info`             | `#3b5a78` | `#9dbcd8` | Neutral context, second chart series  |
| `border`           | `#e4e7eb` | `#262b33` | Hairline, justified boundaries        |
| `border-subtle`    | `#edeff2` | `#1e232a` | Panel edge, soft divider              |

Accents:

| Accent | Light primary | Dark primary |
| ------ | ------------- | ------------ |
| Steel  | `#3f6284`     | `#9dbdd8`    |
| Jade   | `#2f6a52`     | `#8fc9ab`    |
| Clay   | `#8a4f36`     | `#d9a184`    |
| Plum   | `#6a4d75`     | `#c3a8cf`    |

Rules:

- The accent is decorative plus one primary action. Do not add a second brand color.
- Status colors fill dots, thin bars, and soft backgrounds. Do not flood a screen with them.
- Each status color has a soft background token for banners.
- Text on a soft status background uses the matching status text color.
- Both themes meet WCAG AA. Verify every new pairing, including text over glass.

### Load scale

Load meters use their own five-band scale. It is fixed, so it never follows the accent.

| Band       | Light     | Dark      | Range   |
| ---------- | --------- | --------- | ------- |
| `low`      | `#2c6b4b` | `#86c9a6` | 0-19    |
| `moderate` | `#6b5d0a` | `#d9c26b` | 20-39   |
| `elevated` | `#9a4f0e` | `#e0a15c` | 40-59   |
| `high`     | `#8f3b34` | `#e39289` | 60-79   |
| `peak`     | `#6b4a86` | `#c3a8cf` | 80-100  |

- The band drives the meter fill and the matching percentage text.
- Bands are exclusive at the lower edge: 20 is `moderate`, 40 is `elevated`, and so on.
- Do not use these colors for anything other than load.

### Load status

Meters keep the five-band gradient. The vitals header condenses it into four words so the
state is readable without parsing the bar.

| Status      | Range  | Text color             |
| ----------- | ------ | ---------------------- |
| `low`       | 0-19   | `text-load-low`        |
| `normal`    | 20-59  | `text-muted-foreground` |
| `intensive` | 60-79  | `text-load-high`       |
| `critical`  | 80-100 | `text-load-peak`       |

- The label is a small square-cornered tag, right-aligned against the stat name. Load and
  temperature tags sit side by side; they wrap only when the cell is too narrow.
- Each tag pairs a 10px icon with the word: a gauge for load, a thermometer for heat, and
  an up/down arrow for network activity. Words are capitalized; icons are decorative and
  hidden from assistive tech.
- The tag's text color is semantic severity, not the exact meter band, so `normal` stays
  quiet even when the bar is orange.
- Thresholds are exclusive at the lower edge, matching the meter bands.
- Network has no utilization percentage. Its status describes throughput instead:
  `low` under 1 MB/s, `normal` under 10 MB/s, `intensive` under 50 MB/s, `critical` above.

### Temperature status

CPU and GPU also carry a thermal word beside the load word. Bands follow common vendor
guidance: idle chips sit near 30-45 °C, normal load runs 40-70 °C, and throttling risk
starts around 85 °C. GPUs run slightly warmer, so their normal band is wider.

| Status     | CPU       | GPU       | Text color             |
| ---------- | --------- | --------- | ---------------------- |
| `cold`     | under 40  | under 45  | `text-info`            |
| `normal`   | 40-64     | 45-69     | `text-muted-foreground` |
| `hot`      | 65-84     | 70-84     | `text-warning`         |
| `critical` | 85 and up | 85 and up | `text-critical`        |

- A missing sensor shows `—` in muted text rather than a status.
- Temperature status colors are separate from the load scale. Do not reuse the load bands
  for heat.

### Glass

Three roles, no more:

| Class         | Where                                                                |
| ------------- | -------------------------------------------------------------------- |
| `glass-bar`   | The 52px sticky top rail. Content scrolls under it.                  |
| `glass-panel` | Hero summary surfaces: Thermals CPU, Power uptime.                |
| `glass`       | Floating layers: theme popover, process filters, chart tooltip.      |

- Glass uses `--glass` at roughly 60% opacity, `blur(28px) saturate(170%)`, a 1px
  `--glass-border`, and a 1px inset highlight.
- The app canvas carries a faint accent wash so the glass has something to pick up.
- Dense content stays solid: `bg-surface`, `border-border-subtle`, `shadow-card`.
- Provide an opaque fallback when `backdrop-filter` is unavailable, and respect
  `prefers-reduced-transparency`.
- Never place glass inside glass. A popover over a glass bar is the one exception.

## Typography

Manrope Variable is the only sans face. It is loaded locally from
`@fontsource-variable/manrope`, so the app stays offline and passes the Tauri CSP.

Monospace follows Tailwind's `font-mono`, with a Windows-first stack: `Cascadia Mono`,
`Segoe UI Mono`, `Consolas`. Use it for values, IDs, paths, timings, and versions. Never for
headings or paragraphs.

| Role        | Size / line | Weight | Notes                      |
| ----------- | ----------- | ------ | -------------------------- |
| Page title  | 26 / 36     | 500    | Tight tracking, `-0.03em`  |
| Panel title | 13 / 20     | 500    | Sentence case              |
| Reading     | 30 / 30     | 300    | Mono, tabular numerals     |
| Reading sm  | 20 / 20     | 300    | Mono, stacked summary row  |
| Hero reading| 44 / 44     | 300    | One per screen at most     |
| Body        | 13 / 20     | 400    | Default reading size       |
| Label       | 11 / 16     | 500    | Metadata keys              |
| Micro       | 10 / 14     | 500    | Table heads, small counts  |
| Mono value  | 10-12 / 16  | 400    | `tabular-nums`             |

Rules:

- Use 300, 400, and 500 only. No 600 or 700.
- No uppercase eyebrow labels. Sentence case throughout.
- Readings are mono. Percent values are three digits, zero padded (`007%`, `042%`,
  `100%`), so a changing digit does not shift the layout.
- Prose line length stays under 72 characters.
- Numbers in tables use tabular figures. Use `font-mono` where the value is evidence.
- Keep labels short enough to scan: one or two words.

## Icons

Phosphor is the only icon set: `@phosphor-icons/react`. No Lucide, Heroicons, emoji, or
Unicode arrows.

- Default weight: `regular`.
- Sizes: 14 for controls, 15 for navigation, 18 for the theme control.
- Decorative icons get `aria-hidden="true"`.
- Icon-only buttons need an accessible name.
- Use a glyph for direction or actions (sort, copy, refresh, open). A status dot is not an
  icon; it is a text-adjacent mark.

## Shape and spacing

Square edges. Every panel, control, and popover has a 0px radius. The structure comes from
hairlines and spacing, not from rounding.

- `rounded-panel`: 0px. Panels, popovers, charts, state views.
- `rounded-control`: 0px. Buttons, inputs, tooltips, inner chips.
- `rounded-mark`: 0px. Small rectangular indicators.
- `rounded-full`: circles only. Status dots and accent swatches are dots, so they stay round.
- Radii are tokens. Do not invent a radius per component. A future shape change edits the
  three token values in `src/index.css`, not every component.

Meter tracks are five equal 20% segments, each with its own 1px frame and a 4px gap. A
value fills whole segments and partially fills the one it lands in, so 43% reads as
two full blocks plus a short third. No pill shapes.

Charts use monotone curves: smooth without overshooting the sampled values. The sampler
ticks every second, so the chart keeps roughly the last point of each 3-second bucket and
caps the view near 40 points. More samples would only make the line noisier.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.

- Page padding: 16 to 24 (24 at desktop).
- Section gap: 16 to 24.
- Panel padding: 16 to 24.
- Control gap: 8 to 12.
- Use whitespace before dividers and dividers before borders.

## Elevation

The page is mostly flat. Depth comes from the glass and one soft shadow.

- `shadow-card`: solid panels and charts. A tight, low-contrast shadow plus a hairline.
- `shadow-float`: floating glass layers.
- `elevation-glass`: hero glass panels.
- No glow. No colored shadows. No floating cards at rest.
- A panel gets either a hairline and `shadow-card`, or glass. Not both.

## Motion

| Use                                | Duration | Easing      |
| ---------------------------------- | -------- | ----------- |
| Hover, focus, small state change   | 120ms    | `ease-soft` |
| Popover, tooltip                   | 160ms    | `ease-soft` |
| Screen transition, disclosure      | 220-240ms| `ease-soft` |
| Meter fill                         | 500ms    | `ease-soft` |
| Number roll on change              | 260ms    | `ease-soft` |

- Numbers roll per digit when the value changes. Each digit is a clipped window over a
  0-9 strip, so only the changed digits move. Static characters stay put.
- The roll is one CSS transform transition, not a timer loop.
- Under `prefers-reduced-motion` the digits snap to the new value with no travel.
- A reading exposes its real string once to assistive tech; the animated glyphs are
  hidden.

- Screen entry: fade and 8px rise. One animation per navigation.
- Popovers: fade, 6px rise, and a slight scale from 0.985.
- Disclosure: grid-row expansion, not a max-height guess.
- Tab and nav underlines scale from the origin. Select states cross-fade.
- No perpetual motion. A loop is allowed only while work is running.
- Respect `prefers-reduced-motion: reduce`. The base layer disables animation and
  transitions.

## Layout

- A 52px sticky top rail holds the wordmark, four destinations, the appearance control, and
  one live CPU quick stat. There is no sidebar.
- The quick stat is a thin segmented load bar using the load scale: green under 20%,
  yellow under 40%, orange under 60%, red under 80%, purple at 80% and above. The
  percentage uses the same band color, and the bar animates over 500ms.
- The quick stat stays visible at every supported window width. Below 640px it narrows and
  drops the `CPU` label, and the destinations become icon-only with their labels kept for
  assistive tech and native tooltips.
- The rail and screen content share a max width of 1080px, so chrome aligns with content.
- Destinations: Overview, Thermals, Power, Processes. Do not add empty pending screens.
- Each screen uses one `PageHeader`, then flat sections. The main scroll container resets to
  the top when the destination changes.
- Overview vitals sit in a transparent 4-column grid with a 1px `border` frame and
  1px hairline dividers between stats. No panel fill, no shadow.
- The canvas uses a fixed, low-opacity radial wash derived from the current accent.

## Copy

- No descriptions under page titles. The title and data are enough.
- Explain only when the explanation changes interpretation: administrator access, Fast
  Startup, PawnIO, unknown error codes.
- Keep empty, loading, and error states to one short title plus a retry when needed.
- Use plain, specific language. "The disk is reporting SMART errors" beats "Critical failure
  detected".
- No exclamation marks, no alarmist all caps, no marketing language.
- No em dash in prose. The em dash glyph `—` is allowed only as an empty-value placeholder.
- Never say a fix ran unless it did. Preview actions must say "Preview" or be disabled with a
  reason.
- Demo data is labeled as demo data wherever it appears.

## Accessibility

- WCAG AA contrast in both themes, including muted text, status text, and text over glass.
- Every interactive element is keyboard reachable and has a visible focus ring.
- Escape closes dialogs and popovers and returns focus to the trigger.
- Desktop hit targets are at least 40px. Touch targets are at least 44px.
- Status is paired with text, never color alone.
- Headings follow document order. One `h1` per screen.
- Icon-only buttons have accessible names.
- No information exists only on hover.
- Reduced motion and reduced transparency are respected.
- Solid fallbacks exist for glass surfaces.

## Screen states

Every data screen needs three states.

- **Loading:** name what is starting.
- **Empty:** say what is missing in one line.
- **Error:** name what failed, show the code, and offer retry.

A partial result must show which probe failed or was skipped. Never hide a failure behind a
green summary. Do not use skeleton screens that impersonate real data.

## shadcn rules

shadcn/ui supplies accessible primitives. It does not supply the look.

- Components live in `src/components/ui` and use `cn` from `@/lib/utils`.
- Customize through tokens in `src/index.css`, not per-instance colors.
- Do not use the default Geist font, neutral palette, or default radii.
- Do not import Lucide icons. Swap any icon in a generated shadcn component for Phosphor.
- Buttons: primary uses the accent fill. Secondary uses `surface-muted`. Ghost has no
  border. Outline is reserved for a real boundary need.
- Inputs: filled with `surface-muted`, no border at rest, ring on focus.
- Panels: solid surface with a hairline and `shadow-card`, or glass for the three roles.
- Tables: horizontal row separators only. No vertical grid.
- Badges: status only. No decorative capsules.
- Add only the components a screen needs.

## Do and do not

| Do                                        | Do not                                      |
| ----------------------------------------- | ------------------------------------------- |
| Remove copy that does not change a reading| Narrate the interface                        |
| Use glass for chrome and summaries        | Put glass behind tables and charts          |
| Use the accent at the one key action      | Spread accent color across the screen       |
| Use status color for real severity        | Decorate with red, amber, or green          |
| Use Phosphor glyphs for actions           | Use Unicode arrows, emoji, or mixed sets    |
| Use Manrope for UI and mono for facts     | Set headings or paragraphs in mono          |
| Keep corners systematic                   | Invent a radius per component               |
| Use one soft shadow                       | Add glow or large shadows everywhere        |
| Keep motion to arrivals and state changes | Add pulsing dots or idle loops              |
| Label demo data                           | Invent machine stats or fix results         |
| Show empty, loading, and error states     | Ship only the happy path                    |

## Decision log

- **Cool graphite:** the previous warm paper base fought the status palette. A cool neutral
  scale reads as a system tool and keeps the accent calm.
- **Top rail, no sidebar:** diagnostics are wide, not navigation-heavy. A 52px rail returns
  horizontal room to charts and tables and avoids the default dashboard shell. The old
  sidebar load bars return as one color-coded CPU quick stat at the right edge.
- **One accent, four themes:** Steel is the default; Jade, Clay, and Plum change the accent
  only. The neutral scale and status colors stay fixed.
- **Frosted glass, three roles:** the top rail, hero summaries, and floating layers. Data
  surfaces stay solid so the glass never hurts legibility.
- **Square edges:** the 16/10/6 radius system read as soft and generic. Zeroing the three
  radius tokens keeps panels aligned to the hairline grid and makes the tool feel precise.
  Circles survive only where the mark is a dot.
- **Thin type:** 300 for readings, 400 for body, 500 for labels. This keeps density without
  the generic 600/700 dashboard voice.
- **Motion 2:** screen transitions, popovers, disclosure, and meters carry state. There is no
  idle animation.
- **Minimal copy:** page descriptions, section intros, and explanatory paragraphs were
  removed. The screens keep only data and the few explanations a technician needs.
- **Phosphor:** one coherent weight system. It avoids the sparkle language of AI products.
- **Manrope:** humanist geometric forms and open counters feel friendly without becoming
  childish. The variable file keeps the app offline.
- **Windows mono stack:** Cascadia Mono and Consolas already exist on target machines, so
  technical values get a clear face without another download.
- **shadcn:** accessible primitives and a token-first API that fits Tailwind v4.
- **Tailwind CSS v4:** CSS-first tokens, no separate config file, and first-class Vite
  support for the Tauri build.

## Implementation map

- `src/index.css`: color, glass, type, radius, shadow, canvas, and motion tokens.
- `src/theme/`: theme modes, four accents, storage, and the boot script in `index.html`.
- `index.html`: flash-free theme boot before React renders.
- `src/components/layout/TopBar.tsx`: sticky glass rail, CPU quick stat, and appearance
  control.
- `src/components/layout/Screen.tsx`: page width and `PageHeader`.
- `src/components/primitives/`: Button, Panel, Meter, Reading, RollingValue, StatusMark,
  StateView, Disclosure.
- `src/components/ResourceChart.tsx` and `Sparkline.tsx`: chromeless data graphics.
- `src/lib/navigation.ts`: the four destinations and Phosphor icons.
- `src/lib/loadLevel.ts`: load tone thresholds and classes.
- `src/screens/`: Overview, Thermals, Power, Processes.
- `src/hooks/`: Tauri event streams and data shapes.
