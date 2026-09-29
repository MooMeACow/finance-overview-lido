# Golden-hour Lido: Finance Overview redesign

Status: direction approved 2026-09-29 (option "Golden-hour Lido"). Web-first; the phone app keeps
working with the new colours and type.

## Design read

Overhaul redesign of a single-user personal-finance web app (a dashboard, not a landing page), for a
design-conscious owner, in a playful and cozy "sunlit pool at golden hour" language. Custom token
system on React Native Web plus web-only canvas and WebGL layers. No off-the-shelf design system.

Dials (taste-skill): DESIGN_VARIANCE 6, MOTION_INTENSITY 7, VISUAL_DENSITY 5.

## Concept

The dashboard is a lido. Your money is the pool.

- **The pool (hero).** A WebGL water surface with moving caustic light. The overall total sits on the
  water in large display type, with current, savings and the 6-month outlook as glass chips.
- **The raft.** Sea otters float in the pool, one per account, each hugging a pebble sized by its
  balance. Real sea otters hold paws in a raft so they don't drift apart, and keep a favourite stone.
  They follow the cursor, blink, bob, yawn and dive. Hover an otter to see its account, click it to
  edit it. Hovering an account row elsewhere makes its otter look up.
- **Liquid data.** Forecast and monthly charts are water columns with slowly moving wave tops.
  Budgets are lane ropes: beads fill as you spend, turn sun-yellow in the last stretch, coral when over.
  "Kept of income" is a lifebuoy ring.
- **Day swim and night swim.** Light mode is a warm deck at golden hour; dark mode is the pool at
  night, lit from below. Both follow the system setting.

## Visual system

Colour (one accent: cobalt; the others are semantic):

| Token | Day | Night | Use |
| --- | --- | --- | --- |
| bg | #FBF3E4 | #07122E | page (the deck) |
| surface | #FFFDF8 | #0E1E4A | tiles |
| ink | #0E1B3D | #F4EFE4 | text |
| inkSoft / inkMuted | #44527A / #7482A4 | #B7C2DD / #8190B4 | secondary, muted |
| accent (cobalt) | #1F4FE0 | #5B85FF | primary actions, selection |
| aqua | #22B5DD | #3FD4F5 | water, money in series |
| sun | #FFB938 | #FFC95C | golden light, warning zone |
| coral | #F0643F | #FF8766 | money out series, over budget |
| positive | #0B8A68 | #45DDB0 | money in text |

Neutrals are navy-tinted alphas over the cream deck (no warm/cool grey mixing).

Type: Bricolage Grotesque (display: totals, titles) + Geist (UI, tabular numbers). No Inter, no
Fraunces. Custom fonts carry their weight in the family name, never a synthetic `fontWeight`.

Shape lock: tiles 28px, inner elements 16px (concentric: 28 = 16 + 12 padding), hero pool 36px,
controls and chips full pill, inputs 16px. Shadows are navy-tinted and layered; borders only for
dividers.

Icons: Phosphor (duotone for category tiles and nav, regular for controls), through one `Icon`
component that keeps the existing icon names.

Texture: a fixed grain layer and a warm sky glow on the page, never on scrolling containers.

## Layout

- Desktop: floating top navigation (wordmark with a live otter mark, pill tabs, sync status) instead of
  the admin sidebar. Content max 1240px.
- Phone: floating bottom dock with safe-area padding.
- Dashboard: pool hero, then asymmetric rows: forecast 7 / accounts 5, coming up 5 / budgets 7,
  plans 8 / debts 4.
- Monthly: the month is the title (arrows beside it); net + lifebuoy + in/out, 6-month liquid bars,
  categories with lane ropes, biggest expenses.
- Transactions and Import keep their structure with the new system; browser alert/confirm dialogs
  are replaced by an in-app dialog on web.

## Motion (Emil + better-ui values)

- Press: scale 0.96, 150ms ease-out. Hover only under `(hover: hover) and (pointer: fine)`.
- Curves: ease-out `cubic-bezier(0.23, 1, 0.32, 1)`, drawer `cubic-bezier(0.32, 0.72, 0, 1)`.
- First load only: pool fades in, total counts up from 92% of its value (700ms), otters rise from the
  water staggered 60ms, panels stagger 50ms (opacity + 8px).
- Tab switch: no slide; content fades in 150ms. Nav indicator moves 220ms.
- Ambient: caustics, otter life, wave tops. All pause off-screen and in hidden tabs.
- Reduced motion: water renders one still frame, otters stop bobbing (eyes still follow), waves stop,
  no count-up, entrances become opacity only.

## Architecture

- `src/theme.ts`: tokens (colours, radii, space, type, shadows, motion), same exported names as
  before plus new ones.
- `src/lido/`: the design system and signature pieces. Platform files follow the repo's existing
  pattern (`X.tsx` for native, `X.web.tsx` for web):
  - `Text`, `Icon`, `web` (web-only style helper), `setup` (fonts, global CSS, meta).
  - `Water` (WebGL caustics; native: gradient), `OtterRaft` (canvas; native: none),
    `otter/` (pure drawing and behaviour, original code), `pointer` (one shared pointer tracker),
    `raftBus` (hovered account link).
  - `LiquidColumn`, `BeadRope`, `Lifebuoy`, `CountUp`, `Backdrop`, `DialogHost`.
- Screens keep their data loading and logic; only presentation changes.
- Web motion is CSS (transitions and keyframes through React Native Web style passthrough, plus a
  global stylesheet for `:hover`, `:active` and `:focus-visible`). Native stays static for now; adding
  Reanimated for native motion is a follow-up.

## Credits and licences

- little-critters (GordenSun) and Rewamp-UI (palakonweb) have no licence, so they are references
  only; the otter and water code is original.
- procedural-film (MIT, Dean Kuhn): the hand-inked line technique (wobble + 12 fps boil) is adapted
  with credit in the source.

## Error handling

- No WebGL: the pool falls back to a CSS gradient. No canvas: the raft is skipped.
- Fonts load without blocking; system fonts show until they arrive.
- The in-app dialog falls back to the browser's confirm/alert if its host is not mounted.

## Testing

- `pnpm test` (60 existing tests) and `pnpm typecheck` stay green.
- Visual QA: desktop and phone widths, light and dark, reduced motion, in a headless browser and in
  the user's own browser (BrowserSkill).
- Pre-flight: taste-skill checklist items that apply to an app (no em dashes, one accent, one radius
  system, contrast, reduced motion, both themes).
