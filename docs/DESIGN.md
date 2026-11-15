# Windog design direction

Status: active. Applies to every screen and every component.

## Design read

Reading this as: a Windows diagnostic app for service desk technicians, used while an employee watches, in a calm utility style, dial ENERGY 1 / RHYTHM 2 / MOTION 1.

The app often delivers bad news about a PC. The interface should lower stress, not perform urgency. Calm surfaces and one muted accent keep findings readable. Status color is reserved for real severity, so red keeps its meaning.

## Principles

1. **Quiet surfaces first.** Group content with tonal surfaces, spacing, and alignment. Do not draw a box around everything.
2. **Borders are a last resort.** A border must divide, focus, or separate a floating layer. If it does none of those, remove it.
3. **One accent.** Muted blue is the brand accent. Critical, warning, info, and success colors appear only when they describe real state.
4. **Findings lead.** Evidence and the next action are the content. Decoration never competes with them.
5. **Two faces, one language.** Employee and tech views share the same tokens, type, and spacing. Only density and detail change.
6. **Honest data.** Never invent machine stats, timings, confidence, or fix results. Label demo data on screen.
7. **Motion explains, never idles.** Transitions show a state change. Nothing pulses or floats forever.

### Border budget

Default: no border on cards, panels, buttons, badges, or inputs at rest.

| Allowed                | Job it does                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| Focus ring             | Shows keyboard focus                                                     |
| Hairline row separator | Divides dense list or table rows                                         |
| Floating layer edge    | Keeps a menu, popover, or dialog from blending when shadow is not enough |

Rules:

- At most one hairline per visual group.
- Never apply a border to every card or every control.
- No double borders, no 2px outlines around static surfaces.
- Inputs sit on a tonal surface with no border at rest. Focus adds the ring.
- If two surfaces need separation, change the surface tone before adding a line.

## Color

The palette is warm neutral plus one muted blue accent. Status colors are semantic and never decorative.

| Token              | Light     | Dark      | Use                                   |
| ------------------ | --------- | --------- | ------------------------------------- |
| `background`       | `#f6f4ef` | `#141816` | App canvas                            |
| `surface`          | `#fcfbf8` | `#1b211e` | Cards, panels                         |
| `surface-raised`   | `#fffefb` | `#202723` | Popovers, dialogs                     |
| `surface-muted`    | `#f0ede6` | `#1e2421` | Inputs, muted rows, secondary buttons |
| `foreground`       | `#232925` | `#e9ede9` | Primary text                          |
| `muted-foreground` | `#67716b` | `#9ba69f` | Secondary text                        |
| `primary`          | `#4f6d8a` | `#9cb9d3` | Brand accent, primary action          |
| `accent`           | `#e6edf4` | `#25313c` | Hover and selected surface            |
| `ring`             | `#6f8dab` | `#9cb9d3` | Focus ring                            |
| `success`          | `#2f6349` | `#8fc4a9` | Healthy state                         |
| `warning`          | `#7a4e1a` | `#d8a566` | Attention, degraded                   |
| `critical`         | `#8c3f37` | `#e08a80` | Failing, urgent                       |
| `info`             | `#3b5e7d` | `#8fafcb` | Neutral context                       |
| `border`           | `#e3ded3` | `#2b332e` | Hairline, only when justified         |
| `border-subtle`    | `#ece8df` | `#232a26` | Softest divider option                |

Rules:

- Muted blue is the only decorative accent. Do not add a second brand color.
- Status colors fill icons, small dots, thin bars, and soft backgrounds. Do not flood a whole screen with them.
- Every status color has a soft background token for badges and banners.
- Text on a soft status background uses the matching status text color. Do not place body copy on a saturated fill.
- Both themes must meet WCAG AA. Verify every new pairing.

### Glass

Only the selected rail item uses glass today. `--glass-item` is a
`linear-gradient(to top right, dark, light)` at 80% opacity: dark at the bottom
left, light at the top right. The rail tone shows through the remaining 20%.
The icon square reuses the same glass gradient over its own transparent fill,
outlined by a 1px solid `primary` border, so the glyph carries the accent
instead of a filled tile. Do not spread the glass gradient to cards or chrome.

## Typography

Manrope Variable is the only sans face. It is loaded locally from `@fontsource-variable/manrope`, so the app stays offline and passes the Tauri CSP.

Monospace follows Tailwind's `font-mono` utility, with a Windows-first stack: `Cascadia Mono`, `Segoe UI Mono`, `Consolas`. Use it for evidence values, rule IDs, paths, timings, versions, and machine identifiers. Never use it for headings or paragraphs.

| Role    | Size / line | Weight | Notes                     |
| ------- | ----------- | ------ | ------------------------- |
| Display | 32 / 40     | 600    | One per screen at most    |
| Heading | 24 / 32     | 600    | Tight tracking, `-0.02em` |
| Section | 18 / 26     | 600    | Panel titles              |
| Body    | 14 / 22     | 400    | Default reading size      |
| Label   | 13 / 20     | 500    | Controls, metadata keys   |
| Small   | 12 / 18     | 400    | Supporting text           |
| Micro   | 11 / 16     | 500    | Rules, tags, timestamps   |

Rules:

- Use 600 for headings and 400 or 500 for everything else. Avoid 700 except for a single display moment.
- Prose line length stays under 72 characters. Data tables may run wider.
- Uppercase labels are allowed only at micro size with tracking no wider than `0.06em`. Do not set whole headings in uppercase.
- Numbers in tables use tabular figures. Use `font-mono` where the value is evidence.
- The rail item is the one place that drops below micro: 12px label and 10px mono description. Keep it there.

## Icons

Phosphor is the only icon set: `@phosphor-icons/react`. Do not add Lucide, Heroicons, or emoji in UI.

- Default weight: `regular`.
- Active or selected state: `fill`.
- Duotone is allowed only for one large empty-state or status mark, never in controls.
- Sizes: 16 for inline, 18 for controls, 20 for navigation, 24 for section or empty state.
- Icon-only buttons need an `aria-label` and a tooltip when the meaning is not obvious.
- Decorative icons get `aria-hidden="true"`.
- Status is never color alone. Pair the icon with a label or number.

## Shape and spacing

Every corner is square. The interface is blocky on purpose: rectangles align
dense findings to a grid and read as structural, not playful.

- Corner radius is 0 everywhere: cards, panels, inputs, buttons, menus, dialogs,
  badges, tags, and status marks.
- `--radius` is `0rem`, so shadcn radius utilities resolve to square. Never
  override a radius on a single component.
- `rounded-full` is banned, including avatars, dots, and pills. A status mark is
  a small square.
- Rounding is not a hierarchy tool. Use surface tone, spacing, and a leading bar
  instead.
- If a surface feels too hard, change its tone before changing its corners.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.

- Page padding: 24 to 32.
- Section gap: 24 to 32.
- Card padding: 16 to 24.
- Control gap: 8 to 12.
- Use whitespace before dividers and dividers before borders.

## Elevation

The page is flat by default.

- `shadow-soft`: menus, popovers, and a surface that lifts on interaction.
- `shadow-float`: dialogs and sheets.
- `shadow-rail`: the left sidebar only. A soft rightward shadow separates it from the canvas without adding a border.
- `shadow-item`: the selected rail row only. A tight shadow lifts the current destination a couple of pixels off the rail. The row also carries the glass gradient.
- Static cards use a tonal surface only. No shadow, no border.
- No glow. No colored shadows. No floating cards at rest.

## Motion

| Use                              | Duration | Easing      |
| -------------------------------- | -------- | ----------- |
| Hover, focus, small state change | 120ms    | `ease-soft` |
| Panel or disclosure              | 180ms    | `ease-soft` |
| Dialog, sheet, layout shift      | 240ms    | `ease-soft` |

Rules:

- Animate only state changes and entering overlays.
- No perpetual motion, no pulsing dots, no floating orbs, no parallax.
- A progress indicator may loop only while work is running and must stop when it ends.
- Respect `prefers-reduced-motion: reduce`. The base layer already disables animation and transitions.

## shadcn rules

shadcn/ui supplies accessible primitives. It does not supply the look.

- Components live in `src/components/ui` and use `cn` from `@/lib/utils`.
- Customize through tokens in `src/index.css`, not per-instance colors.
- Do not use the default Geist font, neutral palette, or default radii.
- Do not import Lucide icons. Swap any icon in a generated shadcn component for Phosphor.
- Buttons: primary uses the muted blue fill. Secondary uses `surface-muted`. Ghost has no border. Outline is reserved for a real boundary need.
- Inputs: filled with `surface-muted`, no border at rest, ring on focus.
- Cards and panels: tonal surface, square corners, no border.
- Dialogs and sheets: `shadow-float`, no thick border.
- Tables: horizontal row separators only. No vertical grid.
- Badges: status only. No decorative capsule badges.
- Add only the components a screen needs. Do not pre-install a component library for hypothetical screens.

## Copy

- Use plain, specific language. "The disk is reporting SMART errors" beats "Critical failure detected".
- Name the evidence and the next action in the same view.
- No em dash character. Use a comma, colon, period, or parentheses.
- No exclamation marks.
- No alarmist all caps.
- Employee mode gets one sentence and one next step per finding.
- Tech mode gets the rule, confidence, and raw evidence.
- Never say a fix ran unless it did. Preview actions must say "Preview" or be disabled with a reason.
- Demo data is labeled as demo data wherever it appears.

## Accessibility

- WCAG AA contrast in both themes, including muted text and status text.
- Every interactive element is keyboard reachable and has a visible focus ring.
- Escape closes dialogs, popovers, and sheets.
- Desktop hit targets are at least 40px. Touch targets are at least 44px.
- Status is paired with an icon or text, never color alone.
- Headings follow document order. Use one `h1` per screen.
- Icon-only buttons have accessible names.
- No information exists only on hover.
- Reduced motion is respected.

## Screen states

Every data screen needs three states.

- **Empty:** say why it is empty and offer the action that fills it.
- **Loading:** name what is running and allow cancel when possible.
- **Error:** say what failed and how to retry.

A partial result must show which probe failed or was skipped. Never hide a failure behind a green summary. Do not use skeleton screens that impersonate real data.

## Do and do not

| Do                                       | Do not                                 |
| ---------------------------------------- | -------------------------------------- |
| Separate with surface tone and spacing   | Put a border on every card and control |
| Use muted blue at the one key action     | Spread accent color across the screen  |
| Use status color for real severity       | Decorate with red, amber, or green     |
| Use Phosphor at regular and fill weights | Mix icon libraries                     |
| Use Manrope for UI and mono for facts    | Set headings or paragraphs in mono     |
| Keep cards flat                          | Add glow or large shadows everywhere   |
| Keep every corner square                 | Round a corner to soften a surface     |
| Label demo data                          | Invent machine stats or fix results    |
| Use plain, calm copy                     | Use alarmist or marketing language     |
| Show empty, loading, and error states    | Ship only the happy path               |

## Decision log

- **Warm light default:** the employee often watches the session, so a soft paper base is less clinical than pure white. A full dark theme exists for technicians who prefer it.
- **Muted blue accent:** it stays calm against the warm neutral base and keeps a clear distance from warning, critical, and success hues. Blue applies to the accent only. The neutrals stay warm and semantic status colors are untouched.
- **Square corners:** the interface is blocky on purpose. Rectangles align dense findings to a grid and read as structural rather than playful. Radius is 0 in the token layer, so every generated component inherits it.
- **Border budget:** diagnostic screens are dense with findings. Borders add noise, so tonal layering does the grouping.
- **Manrope:** humanist geometric forms and open counters feel friendly without becoming childish. The variable file keeps the app offline.
- **Windows mono stack:** Cascadia Mono and Consolas already exist on the target machines, so technical values get a clear face without another download.
- **Phosphor:** one coherent weight system with regular and fill states. It avoids the default sparkle language of AI products.
- **shadcn:** accessible primitives and a token-first API that fits Tailwind v4. We replace the visual defaults instead of fighting them.
- **Tailwind CSS v4:** CSS-first tokens, no separate config file, and first-class Vite support for the Tauri build.

## Implementation map

- `src/index.css`: color, type, radius, shadow, and base-layer tokens.
- `components.json`: shadcn configuration, Phosphor as the icon library.
- `src/lib/utils.ts`: the `cn` helper used by shadcn components.
- `src/main.tsx`: imports Manrope and the global stylesheet.
- `vite.config.ts`: Tailwind v4 plugin and the `@` alias.

No application screens are part of this setup.
