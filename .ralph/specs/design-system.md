# Vidra User — Design System

> Status: **PREMIUM REDESIGN LANDED** (template-faithful shell + tokens + theme
> switching); **COLOR DIRECTION REVISED 2026-07-19** (accent + semantic color —
> see "Design philosophy" and "Semantic color & protocol identity"). Visual
> source of truth: the Vidra design templates
> (`Vidra App.dc.html`, `Vidra Desktop.dc.html`, `Vidra Admin.dc.html`,
> `Vidra Desktop Admin.dc.html`) and this spec; where this spec's 2026-07-19
> color revision diverges from the templates, the spec wins. Every UI change
> MUST conform to this document — it is a Ralph guardrail, not a suggestion.

## Design philosophy — Apple HIG, quiet luxury

The design follows Apple's Human Interface Guidelines
(https://developer.apple.com/design/): **clarity** (type and spacing carry the
hierarchy), **deference** (neutral chrome defers to the content), and **depth**
(hairline borders + subtle elevation, never heavy shadows).

Deference means *restraint*, not *absence*. Real Apple software is neutral
chrome plus **one confident accent** plus **color used semantically** — think
System Settings' colored icon squares, or Finder's blue selection. The earlier
rule here ("if a change adds a new saturated color to chrome, it is wrong")
executed deference as absence and made the app read gray-on-gray; it is
**overturned**. The current color contract:

- **Chrome and surfaces stay monochrome.** A soft gray canvas (`#f5f5f7`),
  white/near-black surfaces, neutral grays (redesign 2026-07-19 — the earlier
  pure-white canvas is retired so white cards read as elevated). Headers,
  sidebars, tab bars, cards, inputs: no color washes, no gradients, no tinted
  panels.
- **One accent: systemIndigo** (`accent` token below). It is THE interactive
  color — primary actions, active states, links, selection, focus. Chosen to
  echo the indigo the CTAs already leaned toward while staying clearly distinct
  from Bluesky's brand blue. Never introduce a second interactive hue.
- **Color beyond the accent must be semantic**, never decorative: status
  tokens for status, protocol colors inside badges, tinted icon chips and
  status dots (`EmptyState`, notification kinds, admin stats) — never behind
  navigation (see "Semantic color & protocol identity"). A color that doesn't
  *mean* something is still wrong.

Hard rules:
- **Mobile-first.** Phone layout (390px) is designed first; wider viewports
  progressively enhance. Never introduce horizontal overflow at 390/768
  (`e2e/responsive.spec.ts` gates this).
- **Touch targets ≥ 44×44pt** on interactive controls (HIG). Small visual
  glyphs get padding, not smaller hit areas. The narrow player seek strip has
  a documented 24px exception below; its adjacent buttons remain 44px.
- **No hamburger menu holds the primary nav.** Primary nav is the `BottomTabBar`
  (< `sm`) and the `Sidebar` (≥ `sm`). Both are `aria-label="Primary"`; only one
  is ever in the accessibility tree at a time — the destinations are never
  hidden behind a disclosure a viewer has to find first.
  *Amended 2026-09-15 (watch theater).* The `Header` carries one nav CONTROL at
  `sm`+ — a "Menu" icon button, left of the brand, `hidden sm:inline-flex`. It
  does not hold the nav; it toggles the rail that does:
  - **normally** it collapses/expands the `Sidebar` through `lib/sidebar-state`;
    the preference persists. Menu is the sole rail control: there is no
    redundant Collapse/Expand row inside the sidebar;
  - **in an immersive shell** — today only the watch page's theater mode, which
    hides the rail so the stage can span the content area edge to edge, as
    YouTube closes the guide there — it opens the same panel as an overlay
    DRAWER. The drawer is modal-shaped, so it IS a modal: `role="dialog"
    aria-modal="true"`, the shared focus contract (`lib/use-dialog-focus`, the
    same hook `Modal` uses — focus in, Tab trapped, Escape closes, focus
    restored to the Menu button) and `inert` on `#main-content` while it is up.
    It wears `.glass-chrome-solid` — the material's own opaque fallback — because
    the page behind it there is the theater band's #000, where the translucent
    chrome drops `fg-muted` to 3.74:1. The scrim starts below the header and
    stays under its z-index, so the bar the drawer was opened from is still lit
    and the Menu button can close what it opened. The overlay remains a fixed
    224px panel, independent of the persisted collapsed-rail preference.
  It is absent where there is no app sidebar to toggle: below `sm` (phones keep
  the bottom tab bar and get no hamburger — `e2e/mobile-nav.spec.ts`), on
  standalone routes, and on the admin console routes, where the console's own
  rail replaces it.
- **Safe areas**: the tab bar pads with `env(safe-area-inset-bottom)`
  (viewport-fit=cover is set in `app/layout.tsx`).
- **WCAG 2.2 AA** minimum. axe (serious/critical) is a hard gate
  (`e2e/a11y.spec.ts`).

## Theme system (light / dark / system)

Tokens are defined ONCE in `app/globals.css` with `light-dark()` and switch via
`color-scheme`:

- No `data-theme` attribute on `<html>` → follows the OS live.
- `data-theme="light"` / `data-theme="dark"` → user override.
- Preference lives in `localStorage["vidra.theme"]` (`lib/theme.ts`); the
  inline bootstrap script in `app/layout.tsx` applies it before first paint.
- UI: `ThemeToggle` (Light / System / Dark segmented control) on `/settings`.

Rules for components:
- **Never** write `dark:` variants — use semantic tokens; they flip themselves.
  (A repo-level `@custom-variant dark` keeps legacy `dark:` classes in sync
  with the effective theme, but new `dark:` usage is a review defect.)
- **Never** hardcode hex/zinc/red/amber/green palette classes in components.
  The ONLY exceptions are the documented media-overlay + QR cases below.

## Color tokens (`app/globals.css`)

Apple-ecosystem redesign (2026-07-19): the canvas is now a soft systemGray-6
gray (`#f5f5f7`) so white cards read as elevated surfaces; the accent is
systemIndigo; status/protocol/tile hues are Apple system colors. Every value
below is axe-verified against the redesign (see the contrast contract).

| Token utility | Meaning | Light | Dark |
|---|---|---|---|
| `canvas` | page background (soft gray) | `#f5f5f7` | `#0a0a0a` |
| `surface` | cards, panels | `#ffffff` | `#1c1c1e` |
| `surface-muted` | hover fills, subtle panels, chips | `#ebebed` | `#1f1f23` |
| `surface-strong` | progress tracks, pressed fills | `#e1e1e3` | `#2b2b30` |
| `surface-raised` | popovers, menus, sheets | `#ffffff` | `#1f1f23` |
| `fg` | primary text | `#18181b` | `#f4f4f5` |
| `fg-muted` | secondary text — **AA on every surface** | `#5f5f68` | `#a1a1aa` |
| `fg-subtle` | **decorative only** (never meaningful text) | `#a1a1aa` | `#71717a` |
| `border` | inputs, outlined buttons | `#d4d4d8` | `#3f3f46` |
| `border-subtle` | hairline dividers | `#e8e8ea` | `#26262a` |
| `accent` / `accent-fg` | primary action (**systemIndigo**) | `#5856d6` / `#ffffff` | `#5e5ce6` / `#ffffff` |
| `accent-text` | accent as free-standing text (links, active labels) | `#4f4dcb` | `#8a87ff` |
| `focus` | focus ring (follows the accent, HIG-style) | `#5856d6` | `#5e5ce6` |
| `danger` | danger **text/icons** (Apple accessible red) | `#d70015` | `#ff453a` |
| `danger-solid` / `danger-fg` | danger **fills under white text** (buttons, count badges) | `#dc2626` / white | same |
| `danger-surface` / `danger-border` | danger panels / danger status pill | `#fef2f2` / `#fecaca` | `#450a0a` / `#7f1d1d` |
| `success` | positive text/badges | `#0f5f27` | `#30d158` |
| `success-solid` | Apple systemGreen **fill** (dots/health/tiles) | `#34c759` | `#30d158` |
| `warning` | caution text/badges | `#6f4a00` | `#ff9f0a` |
| `warning-solid` | Apple systemOrange **fill** (dots/tiles) | `#ff9500` | `#ff9f0a` |
| `live` | the LIVE pulse dot (sits on media) | `#ff453a` | `#ff453a` |
| `protocol-activitypub` / `-bluesky` / `-ipfs` | tri-protocol identity (badges + ribbon only) | `#6364ff` / `#0085ff` / `#65c2cb` | same |
| `tile-{blue,gray,red,purple,orange,teal,green,pink,indigo}` | tinted icon chips + status dots (EmptyState, notification kinds, admin stats) | Apple system colors | theme-tuned |

Contrast contract (axe-verified, redesign):
- `fg`/`fg-muted` pass AA (≥4.5:1) on `canvas`, `surface`, `surface-muted`, and
  `surface-strong` in both schemes. `fg-muted` was **darkened to `#5f5f68`**
  (light) because the gray canvas + darker `surface-strong` dropped the old
  `#65656e` under 4.5:1 on `surface-strong` (was 4.4:1 → now 4.84:1).
- **Status TEXT** (`danger`/`success`/`warning`) passes on
  `canvas`/`surface`/`surface-muted` AND inside its `/15` tint pill over
  `surface-muted` (the app's real pill backing — e.g. the channel-sync state
  pills). Apple's brighter status hues (`#248a3d`, `#9a6a00`) fail that pill, so
  the light text tokens are **deepened** (`success #0f5f27`, `warning #6f4a00`)
  to clear it. `danger` (`#d70015`) is used as free-standing text and inside
  the `danger-surface` pill (not a `/15` fill — Apple systemRed can't clear AA
  on 15% pink); the `Badge` `danger` variant therefore uses
  `bg-danger-surface text-danger`.
- **`-solid` tokens are FILL/DOT/ICON colors only** (Apple hues), never a
  background under text. Exception: `danger-solid` stays `#dc2626` (not Apple
  `#ff3b30`) because it backs **white-text** destructive buttons and unread
  count badges — white on `#ff3b30` is only 3.55:1. The Apple systemRed lives
  in `tile-red`/`live`, where no text sits on it.
- **Protocol hues never carry text** (the teal/blue fail AA as text): protocol
  badges tint the pill and colour the dot, but keep an `fg` label.

Accent contract: `accent-fg` (white) on `accent` passes AA in both schemes
(≈5.6:1 light, ≈5.1:1 dark). Free-standing accent **text** (links, active nav
labels, selected captions) and the tinted `bg-accent/12` active-pill recipe use
`accent-text`, tuned (`#4f4dcb` light / `#8a87ff` dark) so `bg-accent/12
text-accent-text` clears AA even over the gray canvas (≈5.0:1) — fills, focus
rings, and large/bold accents use `accent`. axe remains the authority —
recompute on any token change.

**Amended 2026-09-03 (glass lit edge).** The dark-mode active-pill recipe now
composites over `--chrome-sheen` as well: the active item is the first row of
both navs, so it sits at the hot end of the sheen's 135° gradient. Sampled from
a screenshot of the real page against `#8a87ff`, worst point on the pill:

| `--chrome-sheen` (dark) | worst-point ratio |
| --- | --- |
| 0 (no sheen) | 5.32:1 |
| **0.03 (shipped)** | **5.00:1** |
| 0.045 | 4.81:1 |
| 0.06 | ~4.6:1 |

0.03 is therefore a ceiling, not a preference — anything above it breaks the
≈5.0:1 contract stated above for that pair. **axe cannot police this**:
axe-core's colour-contrast check does not read pseudo-element backgrounds, so it
keeps reporting the pre-sheen number. Re-derive by hand on any change. (Operator custom-accent overrides only set
`--accent`/`--accent-fg`; extending them to `--accent-text` is a config-wave
follow-up.)

**Documented exceptions** (the only allowed non-token colors):
- **Media overlays** — badges/scrims painted ON TOP of thumbnails or video are
  theme-invariant: `bg-black/60 text-white` (duration), `bg-black/55
  backdrop-blur` pills (LIVE, IPFS), `bg-black/45` dialog scrim, white progress
  bars on media. They sit on imagery, not on themed surfaces.
- **QR codes** — always dark modules on a white padded tile (scanability).
- **Ambient glow** (watch page, `components/watch/AmbientGlow.tsx` +
  `.ambient-glow` in `globals.css`) — the halo behind the player is the video's
  OWN colour, so it is image, not palette. Invariants (numbers live in the CSS,
  where they are tuned): **it may never have an edge** — it bleeds past the
  stage, carries no `overflow` of its own, and its sideways bleed is capped at
  the gutter so `#main-content`'s clip lands on nothing; the falloff is two
  nested single-axis gradient masks, **never `mask-composite`** (whose
  unsupported fallback is the union — a hard rectangle); opacity is a per-theme
  pair whose ceiling is `text-fg-muted` contrast against a WHITE video frame,
  not taste; the cross-fade is never longer than the sampling cadence; and it is
  off entirely under `prefers-reduced-motion`, hidden under reduced
  transparency / increased contrast / forced colors, and not painted below `md`.

**Amended 2026-09-15 (the bespoke player's chrome).** The exception above says
what colour these controls may be; the player pass settled what they must look
like. The rules below govern `components/player/*` and nothing else — the app's
own surfaces keep every rule in this document.

- **Both focus rings need a forced-colors fallback.** `.focus-ring` and
  `.focus-ring-media` are drawn with `box-shadow` over `outline: none`, and
  forced-colors mode drops box-shadow — so in the mode that exists for people
  who need a visible focus indicator, both were invisible. One shared
  `@media (forced-colors: active)` rule restores a real `outline` in `Highlight`.
- **Focus is `.focus-ring-media`, not `.focus-ring`.** The accent ring is built
  from `--surface` and `--focus`; both are surface colours, and over a bright or
  saturated frame the ring disappears. The media ring is a fixed black
  separator + white ring + soft outer glow (tvOS focus is scale, shadow and
  illumination — never a coloured ring). It lives beside `.focus-ring` in
  `globals.css` and is used by every interactive element in `player/*`.
- **Scrim.** `bg-gradient-to-t from-black/80 via-black/45 via-55% to-transparent`
  over ~140px of ramp on a desktop stage (shorter on a phone, where the whole
  stage is ~185px). The HIG's answer to clear material over bright video is a
  real dimming layer; a 40px band leaves white glyphs standing on whatever frame
  happens to be underneath.

  The scrim is what every alpha in the bar is budgeted against, so the budget is
  a MEASUREMENT, not a target. Sampled from composited element screenshots at a
  1920 viewport (860px stage) with a near-white block under the control row —
  the worst case a frame can present — the backdrop at the control row reads
  **85-95**. Against that backdrop:

  | layer | composited | ratio | floor |
  | --- | --- | --- | --- |
  | glyphs `text-white/90` | ~239 | 6.3:1 | 4.5 (text), 3 (glyph) |
  | elapsed `text-white/85` | ~231 | 5.8:1 | 4.5 |
  | chapter + separator `text-white/70` | ~207 | 4.6:1 | 4.5 |
  | autoplay ON track `bg-white/80` | 219 | 4.6:1 | 3 |
  | autoplay OFF track ring `ring-white/70` | 192 | 3.5:1 | 3 |

  Nothing in the bar is allowed below `white/70`: `white/60` computes to 3.9:1,
  which is a legible-looking value that fails AA for text. Re-sample on any
  change to the gradient — every row above moves with it.
- **Buttons.** 44pt round target, 24px glyph, `text-white/90` at rest, a
  `bg-white/12` hover disc with a 150ms scale (reduced-motion neutralises both).
  A toggle that is ON adds a 2px white underline under the glyph — `aria-pressed`
  was always there, but nothing a SIGHTED viewer could read was.
- **Tooltips: one per BAR, never one per button.** Controls report hover/focus to
  the control bar, which draws a single `bg-black/85` bubble ABOVE the whole
  transport (the seek bar included), horizontally centred on the control and
  clamped inside the stage, with the keyboard shortcut in a `<kbd>` keycap
  (thin `white/40` border, `white/80` text, 11px). Immediate on mouse hover and
  keyboard focus, never on touch (`hover: none`). Player controls therefore
  carry NO native `title`. Not wired to `aria-describedby`: an icon-only control
  already carries those words as its accessible name.
- **Auto-hide.** The chrome fades over 250ms after 3s idle while playing, AND
  immediately when the pointer leaves the stage; the cursor goes with it
  (`cursor-none`). It never hides while paused, while focus is inside the bar
  (an open menu holds it), and it hides by OPACITY only — never `display` — so
  focus is never lost.
- **On/off controls that are settings, not actions, are switches.** Autoplay is
  `components/player/AutoplaySwitch.tsx`: `role="switch"` + `aria-checked` (not
  `aria-pressed`), a 36×14 track with an overlapping 20px knob carrying a dark
  play/pause glyph. One component, used by the control bar and the end card. The
  overflow MENU keeps `menuitemcheckbox` rows — a switch inside `role="menu"` is
  the wrong ARIA, and that menu is a themed surface, not a media overlay.

  OFF is a DARK track with a white hairline, never a dim white one: `bg-white/30`
  measured 2.2:1 against the scrim, so the one state the control exists to
  communicate was the one you could not see. The name does NOT carry the state
  either — one function, one name across the bar, the menu and the end card
  (WCAG 3.2.4); `aria-checked`, the knob and the tooltip carry it.
- **Reduced motion must cancel the property the hover actually sets.** The
  scale utilities compile to the `scale` PROPERTY in Tailwind v4, so
  `motion-reduce:transform-none` cannot undo `hover:scale-105` — it looks like a
  guard and does nothing. The one correct recipe lives in
  `components/player/chrome.ts` (`MEDIA_PRESS`) and is imported, never retyped.

### Player transport and settings (2026-09-17)

The right control group contains Autoplay, Captions (when available), Settings,
Picture-in-Picture beside Settings, Cinema mode and Fullscreen. Speed, quality, subtitle language, available audio
tracks, ambient mode, sleep timer and PiP live in Settings. Autoplay is also in
Settings. Container-width tiers move controls that cannot fit into Settings;
44px button targets never shrink. Glyphs are 24px; the transient center feedback uses
36px glyphs and disappears after two seconds, including while paused.

The seek track sits on the lower edge of its target, directly above the 44px
button row. Below a 420px stage its target is 24px tall, an explicit compact
exception to the usual 44px guidance; wider stages keep 44px. At a 320px phone
viewport, the 288×162px video center otherwise falls inside the stacked 92px
controls. The compact strip reduces that stack to 72px, leaving the center
tappable. Do not enlarge hit areas into the video or overlap neighboring
buttons. The track-to-button spacing stays unchanged. The scrim is an absolute
background with no layout padding.
Settings shows current values and navigable submenus; menus remeasure when
contents resize, remain within the viewport and preserve keyboard focus.
Hover/focus fills must differ from the menu surface in both themes.

Space and K toggle play/pause except while typing or operating another native
control. Fixed arrow-key jumps are 5 seconds; J/L and mobile side double-taps
are 10 seconds. Rapid repeats show a cumulative total, resetting after 750ms
or a direction change. Touch seeks use the outer 35% on each side; the middle
30% reveals controls first if hidden, then single-tap toggles playback. Side
single-taps only reveal controls; a second nearby tap within 300ms begins seeking.
These regions/time windows are SizeTube/Vidra choices, not claimed YouTube
constants. Drags, long presses and multitouch cancel tap recognition. Touch
handlers attach only to the video surface and leave controls, scrolling and
pinch zoom alone.

## Semantic color & protocol identity (2026-07-19)

Color beyond the accent is allowed ONLY in these forms — each carries meaning,
none touches chrome:

- **Navigation icons are monochrome — never colored tiles.** *(Rule changed
  2026-09-15; the `IconTile` primitive and the per-destination hue mapping it
  carried are **withdrawn and deleted**.)* Settings rows used to lead with a
  28×28 Apple-system-color square holding a white glyph — the iOS System
  Settings look. Nothing else in the app navigates that way: the Sidebar
  (`components/Sidebar.tsx`), StudioNav, the admin rail
  (`components/AdminConsole.tsx`) and `ModerationSectionNav` all draw a plain
  stroke glyph, `text-fg-muted` at rest, the row's `text-accent-text` when
  active. Eleven saturated squares in a column the app otherwise renders in one
  hue read as a foreign surface, so **every nav row — the desktop
  `SettingsRail` and the mobile grouped rows included — leads with a plain
  monochrome icon**. The standard density is an **18px glyph on a 44px
  (`min-h-11`) row** — Sidebar, `SettingsRail` and `ModerationSectionNav`; the
  **admin console rail deliberately runs denser**, 16px on `h-9` rows, with its
  "More" group carrying no icons at all. Stroke weight follows the caller
  (`1.9` in the Sidebar and `SettingsRail`, the set's `1.8` default in
  `ModerationSectionNav`). What is universal is the *treatment* — one plain
  glyph, muted at rest, accent when active, never a tile.
  (Catalog: `components/settings/sections.tsx`; it carries no hue.)
- **Tinted icon chips and status dots** keep the fixed `--tile-*` Apple-system
  palette in `globals.css` (blue `#007aff`/`#0a84ff`, gray `#8e8e93`/`#98989d`,
  red `#ff3b30`/`#ff453a`, purple `#af52de`/`#bf5af2`, orange
  `#ff9500`/`#ff9f0a`, teal `#30b0c7`/`#40c8e0`, green `#34c759`/`#30d158`,
  pink `#ff2d55`/`#ff375f`, indigo `#5856d6`/`#5e5ce6`) — never ad-hoc
  per-component hexes. It survives the tile's withdrawal because it is what
  `EmptyState`'s icon-in-tinted-circle, the notification-kind chips
  (`bg-tile-*/12 text-tile-*`) and the admin stat dots are drawn from: a ~12%
  tint behind a same-hue glyph, or a solid dot — never a saturated fill under
  navigation.
- **Protocol colors inside badges**: federation/protocol identity is colored
  *inside* `Badge`-shaped elements only — the `Badge` `protocol` variant paints
  a ~12% brand tint + a full-strength brand **dot**, keeping an `fg` label (the
  IPFS teal and Bluesky blue fail AA as text, so the dot carries the colour).
  Tokens: ActivityPub `#6364ff`, Bluesky `#0085ff`, IPFS `#65c2cb`. Protocol
  colors NEVER appear on chrome, buttons, or text outside a badge; the Bluesky
  blue must never be a general interactive color (that is the accent's job, and
  the two must stay visually distinct).
- **Network-page scope (the one screen where protocol color may breathe).** On
  the **whole Network / about-network page** — not just its hero — protocol color
  is sanctioned beyond badges: the tri-protocol ribbon divider (ribbon placement
  b), and per-protocol tinted glyph tiles/cards (`bg-protocol-*/12` +
  `text-protocol-*`) naming each network. This is the brief's
  "badges/wordmark ribbon/Network page" allowance. It applies ONLY to this page;
  every other surface keeps protocol color inside badges + the two other pinned
  ribbon placements.
- **Sanctioned OAuth-brand exception — the Bluesky glyph on auth buttons.** On
  the login / connected-accounts provider buttons, the Bluesky provider mark may
  render in its brand blue as an **OAuth brand glyph only** (the icon, never the
  button fill or its text). This is the standard "sign in with <provider>"
  brand-mark carve-out, not a second interactive hue — the button chrome and
  label stay monochrome/accent.
- **Signature element — the tri-protocol ribbon** (`ProtocolRibbon`): a 2.5px
  gradient rule `linear-gradient(90deg,#6364ff,#0085ff,#65c2cb)` — the one
  sanctioned decorative use of protocol color. The gradient is defined once
  (`.protocol-ribbon` in globals.css). HARD CAP — **exactly three placements
  app-wide, PINNED**: (a) under the header wordmark, (b) the Network /
  about-network page hero divider, (c) the top edge of federated-origin badges
  (the `Badge` `federated` variant). Anywhere else is a review defect.

## Sanctioned macro-patterns (2026-07-19)

The following workflow-level patterns are sanctioned; guardrails must not be
read as blocking them. Each keeps the existing nav rules (BottomTabBar/Sidebar
primary nav, no hamburger holding that nav, one `<main>`, 44pt targets):

- **Split-view settings** (macOS System Settings): Settings, Admin, and
  Moderation replace their long horizontal tab strips with a section sidebar
  (≥ `md`) + detail pane; on phones the section list is the page and sections
  drill in (grouped-rows pattern below stays the mobile idiom).
- **Mail-style triage for Moderation**: queue list left, detail + action bar
  right; single-key archive/act affordances may follow.
- **Shelves on Home** (Apple TV pattern): horizontally scrolling themed rows
  (Continue watching, Following, Trending…) instead of one undifferentiated
  grid; shelf headers use the section-heading type ramp. Continue watching
  excludes finished videos (position ≥ ~95% of duration — the shared
  `lib/resume-progress.ts` threshold, which also hides the resume bar). The
  authed-only shelves band reserves its space before first paint via a
  remembered shelf count (`lib/home-shelves-hint.ts`: localStorage
  `vidra:home-shelves-count` → `<html data-home-shelves>`, mirroring the
  broadcast dismiss pre-paint script) so it never shoves the chips + grid down
  on a returning signed-in visit. The home page no longer promotes the newest
  upload to a large hero (that accidental "featured" tile is gone); an explicit
  admin-controlled **Featured banner** (YouTube masthead pattern) is the only
  featured slot, size-budgeted so the grid stays visible below it.
- **Studio storage bar** (iCloud pattern): a single segmented capacity bar
  summarizing quota by media kind.
- **Stepped upload sheet**: upload becomes a staged sheet (pick → details →
  publish) with a persistent minimized progress pill; the pill is chrome-level
  UI and therefore stays monochrome + accent.
- **Studio tabbed IA + channel switcher** (YouTube Studio pattern): the creator
  Studio is split into per-surface tabs — **Dashboard / Content / Live /
  Analytics / Channel** — under one shared shell (`app/studio/layout.tsx` mounting
  `StudioProvider` + `StudioNav` above the active surface), replacing the single
  long scroll. The Studio is scoped to ONE **current channel** (loaded once via
  `api.getMyChannels`, persisted in `localStorage["vidra.studio.channel"]`,
  validated against the list with a `channels[0]` fallback); every surface reads
  it from context, so the old per-section channel `<select>`s are gone (the
  upload form keeps its in-form channel picker, PeerTube-style, shown only when
  >1 channel and defaulted to the current one). The switcher sits in `StudioNav`:
  avatar + display name + a compact protocol badge, rendered as a `Dropdown`
  (channel rows + a "New channel" entry) when the caller has more than one
  channel, a static label when exactly one, and a quiet "no channel yet" hint at
  zero (the tab strip still renders — each surface shows its own onboarding
  state). The tab strip is the **section-navigation pill** idiom (tint-pill
  active `bg-accent/12 text-accent-text`, muted-hover inactive, 44px targets,
  horizontal scroll on phones), never an underline rail. The `/studio?video=<id>`
  single-video management deep link (moderator/owner) renders full-page with the
  studio nav hidden. Analytics carries **two scopes** — "This channel" and
  "All my channels" (an owner-scoped rollup from the backend `GET /me/stats`,
  hidden for a pure editor) — via `SegmentedControl`. Live's create form and the create-channel
  form are launched `Modal`s (dialog on desktop / `variant="sheet"` on mobile),
  consistent with the stepped upload sheet. Keeps the nav rules
  (BottomTabBar/Sidebar primary nav, one `<main>`, no hamburger holding that
  nav, 44pt targets).
- **"+ Create" dropdown** (YouTube two-tier Create pattern): a single global
  creator entry that fans out into the flows rather than dumping the user on the
  dashboard. Desktop lives in `Header` as a `Dropdown` (the outline "+ Create"
  pill trigger, right-aligned menu, `hidden sm:flex`); phones use the
  bottom-tab `CreateSheet`, whose rows mirror it. Both list the two primary
  flows — **Upload video** → `/studio/content?upload=1`, **Go live** →
  `/studio/live?new=1` — then a divider, then **New channel** →
  `/studio/channel?create=1` (the sheet also keeps **Open Studio** → `/studio`
  as its Studio entry). Each item is a real deep link into the studio surface
  that auto-opens the flow (`?upload=1` / `?new=1` / `?create=1`, param stripped
  after open). Glyphs carry the only color: the upload arrow wears `accent`, Go
  live wears the `live` token; New channel stays neutral. The shared `Dropdown`
  primitive supports this via optional `DropdownItem.href` (renders a `role=
  menuitem` `next/link`; Space/Enter activate it), `DropdownItem.icon` (a leading
  glyph slot), `{ type: "separator" }` dividers, and `{ type: "label" }` group
  headings (decorative `role="presentation"`) — separators and labels are skipped
  in the arrow-key focus ring. The channel switcher uses the label + separator
  entries to group **Your channels** vs **Shared with you** (by the caller's
  `role`) when the caller both owns and collaborates on channels.
- **Studio Distribution card** (per-channel protocol control): the Channel tab
  and dashboard both render `DistributionCard`, driven by the channel's real
  fields (`activitypub_enabled`, `atproto_enabled`, `atproto_active`). Two rows —
  **ActivityPub** (federation) and **ATProto** (Bluesky cross-posting) — each led
  by the guardrail-correct colored `Badge variant="protocol"` (brand tint + dot +
  neutral label; NOT the monochrome `ProtocolBadge`, and NEVER a ribbon). Owners
  (`canManage`) get instant-effect `Toggle`s that `PATCH` the channel; the ATProto
  toggle only shows once a Bluesky account is linked (an unlinked owner sees a
  "Link your Bluesky account" CTA → `/settings/connections`), and the whole row is
  hidden when the instance extension is off (probed via `GET /me/atproto` 503,
  mirroring `/settings/connections`). Editors and the dashboard summary see
  read-only status badges (`atproto_active` drives the ATProto "Active" state).
  The same compact protocol chips (`ChannelProtocolBadges`) appear on the
  StudioNav identity + switcher rows. Protocol color stays inside these badges
  only; a channel that federates nowhere reads as a neutral "Local only" chip.
- **Studio Collaborators card + editor role** (channel collaborators, first-class
  where PeerTube shipped it late): the Channel tab's `CollaboratorsCard` lists a
  channel's editors (display name, `@username`, role); owners get an invite-by-
  handle form (role Editor; 404 "No such user" / 409 "already manages this
  channel" surfaced inline) and a confirm-gated remove. A channel **shared with
  you as editor** (`role: "editor"` on `GET /me/channels`) renders a read-only
  Channel tab — the edit form, avatar/banner managers, sync section, distribution
  toggles (badges still shown), and danger zone are all hidden — while keeping
  full Content/Live/Analytics/Dashboard access. Analytics' **All channels** scope
  is owner-scoped (`GET /me/stats`): it is labeled "All my channels" and hidden
  entirely for a pure editor (zero owned channels).

## Typography

System stack (`--font-sans`): `-apple-system, BlinkMacSystemFont, "SF Pro
Text", …` — SF Pro on Apple platforms, native elsewhere, zero webfont cost.
Mono (`--font-mono`): `ui-monospace, "SF Mono", …` for stream keys, wallet
addresses, code.

**Apple HIG type ramp** (redesign, `@theme` tokens in `globals.css` — Tailwind
v4 emits one utility per token with its line-height / tracking / weight baked
in):

| Utility | Size | Weight | Tracking |
|---|---|---|---|
| `text-large-title` | 34px | bold (700) | −0.4px |
| `text-title` | 28px | bold (700) | −0.3px |
| `text-title2` | 22px | semibold (600) | −0.2px |
| `text-headline` | 17px | semibold (600) | — |
| `text-body` | 17px | regular | — |
| `text-subhead` | 15px | regular | — |
| `text-footnote` | 13px | regular | — |
| `text-caption` | 12px | regular | — |

Page H1s use `text-large-title` on desktop / `text-title` on mobile (e.g.
`text-title sm:text-large-title`). Shelf/section headers use `text-headline`.
Keep `tabular-nums` on updating numbers. The legacy scale below still applies
where the ramp is not adopted:

Scale (Tailwind defaults; the premium look comes from weight + tracking):
- Page titles: `text-2xl font-bold tracking-tight` (mobile large-title feel).
- Brand wordmark: `text-xl font-bold tracking-[-0.045em]`.
- Section headings: `text-[15px] font-bold tracking-tight`.
- Body: `text-sm`; metadata: `text-[13px] text-fg-muted`.
- Buttons/chips/labels: `font-semibold`, sizes 13–14px.
- Micro-labels (states, uppercase): `text-[10.5px] font-bold uppercase
  tracking-[0.04em]`.
- Numbers that update (durations, counts): `tabular-nums`.

## Shape language (radius)

| Element | Radius |
|---|---|
| **Buttons, `LinkButton`** (all variants/sizes) | `rounded-[10px]` |
| Chips, sort pills, `Badge`, avatars, search field, `IconButton` | `rounded-full` |
| Inputs, textareas, selects | `rounded-xl` |
| Thumbnails | `rounded-xl` (dense lists: `rounded-lg`) |
| Cards, panels, player | `rounded-2xl` (16) |
| Grouped settings rows/lists | `rounded-2xl`; row radius 12 |
| Modals (dialog) | `rounded-[20px]` |
| Feature thumbnails / hero media (feed) | `rounded-2xl` |
| Bottom sheets | `rounded-t-[22px]` |
| Menu items inside popovers | `rounded-lg` |

## Component patterns (from the templates)

- **Chips / segmented filters** (Recent · Popular · Trending): pill buttons —
  active `bg-accent text-accent-fg border-accent`, inactive `border-border
  text-fg-muted` with `hover:bg-surface-muted`. Group carries
  `role="group"` + `aria-label`; buttons use `aria-pressed`.
  **Two distinct chip recipes — do not mix them:**
  - **Content filter / sort chips** (they narrow or reorder the *content* below
    — Recent/Popular/Trending, feed scope, a pending/all filter): **solid accent
    fill when active** (`bg-accent text-accent-fg`), outlined when inactive. The
    accent means "this filter is applied."
  - **Section-navigation pills** (they switch which *section* you are viewing —
    About sub-tabs, in-page section rails, the About top tabs): the **tint pill**
    active recipe (`bg-accent/12 text-accent-text` + semibold), muted-hover when
    inactive — the same active-nav language as the sidebar/bottom-tabs. Never an
    underline tab-rail and never a solid accent fill; navigation is not a filter.
- **Segmented switcher** — the `SegmentedControl` primitive
  (`components/ui/SegmentedControl.tsx`), the app-wide single-select switcher
  (Inbox Notifications | Messages, ThemeToggle Light/System/Dark, FeedScope
  Local/All, admin role picker). Rounded-rect, NOT pill: a
  `rounded-[10px] bg-surface-muted p-[3px]` track with `rounded-lg` segments;
  the active segment raises on `bg-canvas` with a `0 1px 4px` shadow +
  `font-semibold`. `role="group"` of `aria-pressed` toggle buttons; named via
  `label` (→`aria-label`) or `labelledBy` (visible heading); `size` sm/md,
  `fullWidth` (flex-1 segments), optional muted `tabular-nums` `count` suffix.
  Distinct from the pill **sort chips** above — never reuse the chip look for a
  switcher.
- **Video card**: thumbnail (`aspect-video rounded-xl`/`2xl`, `bg-surface-muted`
  fallback) with overlay badges (duration bottom-right `bg-black/60`; LIVE
  top-left pill with `bg-live animate-[live-pulse_1.6s_infinite]` dot; IPFS
  pill top area); below: 36px avatar + `font-semibold` 2-line-clamped title +
  `text-fg-muted` meta that STACKS two lines (YouTube-familiar): the channel
  link, then a `views · age` line beneath it (same footnote/muted tokens — the
  change is structure, not a reskin). A history card adds a thin white
  resume-progress bar on the thumbnail, hidden once the video is finished
  (≥ ~95%) via `lib/resume-progress.ts`.
- **Status badges** (Published / Processing / Draft / In review / Failed):
  `Badge` primitive or uppercase micro-label pills — success/warning at `/15`
  fill with token text (`bg-success/15 text-success`); **danger** is the one
  exception — `Badge variant="danger"` uses `bg-danger-surface text-danger`
  (Apple systemRed can't clear AA on a 15% pink tint).
- **Protocol / federation badges**: `Badge variant="protocol" protocol="…"` —
  a ~12% brand tint + full-strength dot + `fg` label. `Badge
  variant="federated"` marks a remote origin with the tri-protocol ribbon on
  its top edge (the third pinned ribbon placement). The standalone ribbon is
  `<ProtocolRibbon>` (placements a + b).
- **Nav row icons**: a plain `components/icons` glyph — muted at rest, accent
  when active, never a colored tile (the `IconTile` primitive was withdrawn
  2026-09-15). Standard density is 18px on a `min-h-11` row (`<Icon size={18}
  className="shrink-0" />`, `strokeWidth={1.9}` where the caller wants the
  Sidebar's weight): Sidebar, `SettingsRail`, the mobile grouped settings rows,
  `ModerationSectionNav`. `AdminConsole`'s rail is the one sanctioned
  exception — 16px on `h-9`, icons on the primary group only — because it lists
  fourteen destinations and progressive disclosure is the point of that rail.
- **Grouped settings rows** (mobile settings): a `rounded-2xl overflow-hidden`
  group, rows `divide-y divide-border-subtle`, each row label + optional
  `text-fg-muted` sub-line + chevron; group headers `text-xs font-bold uppercase
  tracking-[0.06em] text-fg-muted`.
- **Grouped-card fill rule (surface on the gray canvas).** On the soft gray
  canvas (`#f5f5f7`), a standalone item card or a grouped row/list is a **white
  (`bg-surface`) elevated surface** — `border border-border-subtle` (hairline) or
  `shadow-soft`. `surface-muted` is **not** a card fill on the canvas; it reads as
  gray-on-gray and flattens the elevation the redesign is built on. Reserve
  `surface-muted` for **insets inside an already-white card** (a nested form
  block, a read-only field) and for **hover fills** (`hover:bg-surface-muted`).
  Grouped settings lists, moderation comment/blocked-video cards, watched-word
  rows, playback rows: all white `bg-surface`. (A muted list nested *inside* a
  white card is fine — it is an inset, not the top-level card.)
- **Channel header**: banner block, overlapping `rounded-full` avatar with
  `border-canvas` ring, name `font-bold tracking-tight`, pill actions
  (Follow = accent fill when not following; outlined "Following" when
  following).
- **Empty/error states**: `EmptyState` leads with an icon in a 48px tinted
  circle (`bg-accent/12` + accent glyph; `tint` prop for a themed hue) — the
  dashed border is retired. `ErrorState` keeps its danger-surface panel.
- **Dialogs**: `Modal` primitive (`rounded-2xl`, `bg-black/45` scrim). Bottom
  sheets on mobile may extend it later — same a11y contract.
- **Notifications popover** (header bell, `NotificationsBell`): a disclosure
  button (`aria-expanded`/`aria-controls`, unread badge) opening a
  `rounded-2xl border-border-subtle bg-surface-raised shadow-soft-strong` panel — recent
  items (icon chip + lead/rest text + age + unread dot, reusing
  `describeNotification`) above a full-width "See all notifications" footer
  link to `/notifications`. Focus moves into the panel on open and back to the
  bell on close; Escape / outside-click / route-change dismiss. Anchored
  `right-0` under the bell at `sm+`, full-width fixed card on phones.

## Motion

Fast and quiet: `transition-colors` on interactive fills (~150ms default),
`live-pulse` keyframes for LIVE dots, spinners for progress. No parallax, no
bounce, nothing longer than **300ms** (redesign: 200–300ms is the range; the
old ~200ms cap is lifted to 300ms). Cards and shelf tiles get a subtle hover
lift — `hover:scale-[1.02]` with `transition-transform` (~200ms). `soft` /
`soft-strong` shadows (`shadow-soft`, `shadow-soft-strong`) replace heavy
popover shadows: `0 8px 30px rgb(0 0 0 / .06)` for raised cards, `/.10` for
floating popovers/menus/dialogs. `prefers-reduced-motion` is neutralized
globally in `globals.css` (it zeroes transition/animation durations, so the
hover-lift transform is neutralized too) — components never branch on it.

## Navigation material

The app shell uses one shared `.glass-chrome` functional layer for the header,
desktop sidebar, and phone tab bar. It is a translucent, blurred monochrome
material when `backdrop-filter` is supported, with a solid `surface-raised`
fallback. `prefers-reduced-transparency`, `prefers-contrast: more`, and forced
colors all use the solid treatment. Keep this material on navigation and
transient controls; content cards remain on standard canvas/surface materials.

The material comes in two boxes. The **floating** one (rounded, ringed,
shadowed) is the sidebar and the phone tab bar. The **full-bleed** one — the
same material plus `.glass-chrome-flush`, which drops the radius, the ring, and
the shadow in favour of a single bottom hairline — is the app header, which
spans the viewport edge to edge with no top or side gutter. A new surface picks
one of these two; it does not invent a third box.

**The lit edge (added 2026-09-03).** The material carries a 1px specular
highlight on its top edge (`--chrome-highlight`, dark 0.28) and a shallow 135°
sheen (`--chrome-sheen`, dark 0.03 — see the contrast ceiling above), drawn by a
`.glass-chrome::before` layer. Both are
decorative — no text sits on them (the layer is `z-index: -1`, below content) —
and all three accessibility fallbacks `display: none` the layer outright.

Three rules that are load-bearing, each of which was a bug first:

1. **The highlight belongs to the floating box only.** It is scoped to
   `.glass-chrome:not(.glass-chrome-flush)`. A lit top edge is a floating-panel
   affordance; the flush header is defined above by dropping exactly those, it
   is pinned to y=0 with nothing above it to be lit by, and on a notched phone
   the line would land inside the status-bar strip. The header keeps the sheen,
   which is a property of the material rather than of the box.
2. **`.glass-chrome` must never set `position`.** The pseudo-element positions
   against the containing block `backdrop-filter` already establishes. Setting
   `position: relative` in `globals.css` silently beats a `sticky` utility at
   the call site — `cn()` has no tailwind-merge and `globals.css` is emitted
   after Tailwind's utilities — and the header stops sticking. Consequently
   **any element taking `.glass-chrome` must carry its own positioned utility**
   (`sticky` or `relative`); relying on `backdrop-filter` alone is undefended
   outside Chromium.
3. **An element taking `.glass-chrome` must not itself scroll.** An `inset: 0`
   pseudo whose containing block is a scroll container scrolls with the content,
   so the highlight leaves the viewport on the first scroll. Put `overflow-y-auto`
   on an inner wrapper (see `components/Sidebar.tsx`).

Light-mode values are deliberately **zero**. `--chrome` composites to
rgb(253,253,253) there, so white-on-white measured a global max delta of 4/255
across a 1440×900 viewport — and a non-zero value flashes a bright diagonal only
when dark media scrolls under the header. In light, the border and shadow carry
the separation; the lit edge is a dark-theme affordance.

**Radius token fork.** Tailwind v4 only emits `rounded-*` utilities from the
`--radius-*` namespace, so the in-product token is `--radius-sheet: 22px` while
the published system names the same value `--r-sheet`. The fork is deliberate.
Only the radius with a call site is defined; the rest of the published ladder
(`--r-btn` 10 / `--r-input` 12 / `--r-card` 16 / `--r-dialog` 20 / `--r-full`
999) lands with the migration that adopts it. Nav-chrome children are
concentric: the tab bar's cell is 17px = 22 − (4px `p-1` + 1px border).

## Component primitives (`components/ui/`)

Import from the barrel `@/components/ui`. All primitives are token-driven and
carry the a11y contract (see their doc comments): `Button`/`LinkButton`
(**`rounded-[10px]`**, primary = solid `accent` + accent focus ring; variants
primary/secondary/danger/ghost + **`tonal`** = borderless
`bg-surface-muted text-fg hover:bg-surface-strong`, the design's dominant
secondary action; + **`danger-outline`** = `border-danger/45 text-danger`
using the AA-safe danger *text* token, not the solid fill), `IconButton`
(round, label required), `SegmentedControl` (see switcher above),
`Input`/`Textarea`/`Select` (rounded-xl, label/hint/error wiring),
`Checkbox`/`Radio` (native), `Toggle` (`role="switch"`; **46×28 track, 24px
`bg-canvas` knob travelling 2→20px**, on-track `bg-accent`), `Modal` (focus
trap/restore, Escape, scrim; `variant="dialog"` centered `rounded-[20px]` /
`variant="sheet"` mobile bottom-sheet `rounded-t-[22px]` + grab handle +
safe-area), `Dropdown` (menu-button pattern), `Tabs` (WAI-ARIA tabs), `Toast`
(live regions), `Card`, `Badge` (default sentence pill + **`status`** =
`text-[10.5px] font-bold uppercase tracking-[0.04em]` micro-label, + role
pills **`inverse`** `bg-fg text-canvas` (ADMIN) / **`strong`**
`bg-surface-strong text-fg-muted` (MOD), + **`protocol`** (brand tint + dot +
`fg` label, `protocol` prop) / **`federated`** (remote origin, tri-protocol
ribbon top edge)), `Avatar`, `Skeleton`, `Spinner`, `EmptyState`
(icon-in-tinted-circle),
`ErrorState`, `LoadMoreButton`. `ProtocolRibbon` (components/) is the standalone
tri-protocol gradient rule.
Custom components, not UI-kit wrappers. Do not fork these patterns locally.

## Iconography (`components/icons`)

`components/icons/index.tsx` is the **single source of truth** for iconography —
the 41-icon feather-style set (24×24 viewBox, `stroke="currentColor"`, round
caps/joins, 1.8px default stroke; filled glyphs — Play/Playlist/MoreHorizontal/
Library inner play — set `fill=currentColor stroke=none`). Paths are vendored
**VERBATIM** from the design source (`.ralph/specs/design-refresh-icons.md`);
never substitute a library's variant when the design's path differs. Typed
`IconProps` (`size` default 20, `strokeWidth`, `label`); an icon is decorative
(`aria-hidden`) unless given a `label` (→ `role="img"` + `<title>`).

- **No ad-hoc inline `<svg>` icons** in components/pages. If a glyph exists in
  the set, import it; if the design uses a new glyph, add it to the set
  path-verbatim (with MIT/Feather attribution where applicable) — do not inline
  it at a call site. The DR13 sweep converged all duplicated design glyphs
  (search, close, bell, share, download, playlist, external-link, check, info,
  chevron) onto the set. Legitimately-inline SVGs that remain are NOT icons: the
  QR renderer (`QrCode`), the stats chart (`StatsChart`), the animated `Spinner`,
  the bespoke player chrome (`player/*`), keyboard keycaps (`KeyboardShortcutsHelp`),
  and a few app-specific marks with no design-vocabulary equivalent (federated
  globe, protocol/privacy glyphs, quality sliders, messaging attachment-kind
  glyphs and the new-message compose mark).
- **The player-chrome exception is ONE module (2026-09-15):
  `components/player/icons.tsx`.** `player/*` may inline SVG, but not at call
  sites: the bar's coherence is a property of the SET, and the old bar proved
  it — feather-style 2px outlines for speaker and captions next to a solid play
  triangle, which is what made a bespoke player read as a stock `<video>`. The
  module's house style: 24-unit viewBox; SOLID SF-Symbols-like forms
  (`play.fill`, `speaker.wave.2.fill`, `captions.bubble.fill`, `pip.fill`);
  frames (theater, PiP) drawn as filled evenodd paths rather than hairlines so
  their optical weight matches the solids; `fill="currentColor"`, `aria-hidden`;
  and sizing through a `size` prop that sets the width/height ATTRIBUTES —
  never `h-*`/`w-*` classes, because `cn()` is a plain concat with no
  tailwind-merge and that is exactly how the kebab glyph got squeezed. Default
  24px, on 44pt round targets. A glyph the chrome does not use does not belong
  in it: speed and quality live in the Settings submenu, and menu rows
  use the app set's `CheckIcon`, because those rows are a themed surface.
- **SVG only, never emoji or unicode-glyph icons.** `npm run lint:icons`
  (`scripts/check-no-emoji.mjs`) is a **hard CI gate** that fails on emoji
  codepoints in `components/` and `app/` JSX. Non-icon glyphs it deliberately
  allows: `·` separators, `…`, `×` multipliers/dimensions, `←/→` keycaps, `—`
  placeholders, `→` in prose.
- **Kebab / overflow triggers** (`VideoActionsMenu`, comment + admin menus) use
  `Dropdown`'s `triggerVariant="icon"`, never the default pill. The icon variant
  emits an unpadded, borderless, transparent round button so the call site's own
  `h-`/`w-` classes are the sole size authority. Spec: glyph 24–26 (`MoreVertical`
  on cards, `MoreHorizontal` in admin), filled dots `r=2.2` (render ~4.4–4.8px
  once unsqueezed, YouTube-comparable); button targets 44×44 standard, 40×40 the
  deliberate dense-list exception (comment kebab 36×36 floor). **Never neutralise
  the default trigger's `px-3.5 py-1.5` with a `p-0`/`px-0` in `triggerClassName`:**
  same-group Tailwind utilities resolve by stylesheet order, and this repo's
  `cn()` is a plain concat with no `tailwind-merge`, so the base padding wins and
  flex-shrinks the SVG's content box (the kebab regressed to a 12/8px-wide glyph
  this way). Use `triggerVariant="icon"` instead.
- **Menu placement is portal + fixed (Wave D).** The open menu is portaled to
  `document.body` (`createPortal`) and positioned `fixed` from the trigger's
  `getBoundingClientRect()`, then flipped up/down + start/end and clamped inside
  the viewport, with a capture-phase `scroll` + `resize` reposition and
  `focus({ preventScroll: true })` on open/refocus. That is what lets a kebab
  open fully visible from inside a horizontal rail (`HomeShelf`, home
  recommendations, `LibraryView`, admin video table) — the rails are
  `overflow-x-auto`, whose computed `overflow-y: auto` would otherwise clip a
  same-context `absolute` menu — and opening it no longer scrolls the rail. The
  menu sits in the `z-50` band (Header `z-30`, Modal `z-50`); full menu-button
  ARIA (arrows / Home / End / Escape-refocus / Tab, `aria-controls` linkage) is
  preserved across the portal.

## App shell

- `Header` — Menu button (≥ `sm`; toggles the `Sidebar`, see the nav rule
  above), brand, centered pill `SearchBox` (hidden < `sm`; Search is a tab
  there), pill Create → `/studio` (hidden < `sm`), `NotificationsBell`,
  `AccountMenu`. Sticky and **full-bleed**: `.glass-chrome .glass-chrome-flush`
  spanning the viewport with no top/side gutter and a single bottom hairline,
  safe-area padded at the top. The row uses `px-6` on phones and `sm:pl-5
  sm:pr-8` on desktop/tablet. Menu and branding form a gapless desktop group:
  the Menu glyph centers on the sidebar icons, and branding starts at its text
  column. The outer gap to search and actions stays unchanged.
  Sticky offsets that park under it (e.g. `Sidebar`) measure from its `h-16
  sm:h-14` height, not from a gutter.
  The search pill carries a ⌘K / Ctrl K keycap and `aria-keyshortcuts`:
  ⌘K / Ctrl+K / `/` focus it from anywhere (the phone sheet opens instead below
  `sm`), and Escape unwinds it one step at a time — suggestions, then draft,
  then focus. Keep the keycap and `KeyboardShortcutsModal`'s "Focus search" row
  in sync with the handler.
- `Sidebar` (≥ `sm`) — every primary destination + role-gated
  Moderation/Admin, `aria-current="page"`, collapsible icon rail (persisted),
  floating in a rounded `.glass-chrome` panel rather than anchoring to an edge.
  ONE panel, TWO placements: that in-flow rail, and — while a page asks for an
  immersive shell (watch theater) — the same panel as a `fixed` overlay drawer
  over a scrim, opened by the header's Menu button. The link list is never
  forked between the two. State lives in `lib/sidebar-state` (collapsed
  persisted in localStorage; immersive + drawer-open in memory only, because a
  persisted immersive flag would strand a viewer on a page with no navigation).
- `BottomTabBar` (< `sm`) — Home / Search / Create / Inbox / Library, sticky
  bottom in a rounded `.glass-chrome` panel, in-flow (never overlaps content),
  unread dot on Inbox, `aria-current` on the active tab, safe-area padded.
- Both navs return `null` on `/embed/*` (bare iframe player).
- Every page renders exactly ONE `<main>` (landmarks are gated by
  `e2e/a11y-landmarks.spec.ts`).

**The watch page's layout (`.watch-layout`, added 2026-09-15).** The watch
surface is ONE CSS grid with three areas — `stage` / `body` / `rail` — rather
than nested flex columns, and theater mode swaps the AREAS. That is a
correctness rule, not a styling preference: the stage must keep a single DOM
position, because React reconciles by position and rendering it somewhere else
in theater REMOUNTED the player (playback restarted at 0, the mid-watch "Resume
from…" offer reappeared, and a second view was counted on every `T`). Three
things follow, and each was a defect first:

- **The two-column switch is `xl` (1280px), not `lg`.** At 1024 the sidebar
  (224) plus the reserved rail (344) left a 368×207 stage with a three-line
  title. YouTube drops to one column at about the same available width.
- **The secondary column's 344px track is reserved whether or not anything
  renders into it.** Sizing it to its content shifted the largest element on the
  page when the related fetch resolved empty.
- **Theater is inert below that breakpoint**, in CSS (`.watch-theater-band`,
  `.watch-layout-theater`) and in JS (`WATCH_TWO_COLUMN_QUERY`, which also gates
  the immersive flag): there is no second column to collapse, no width to gain,
  and a full-bleed square-cornered phone player is not an improvement.

The stage's size ceiling is one token, `--watch-stage-max-h` — the viewport
minus the masthead and the space the page owes the title, floored at 480px —
read by the theater band as a height and by the default player column as a width
at 16:9, so the two modes cannot disagree.

**Watch actions (2026-09-17).** Show functional labels for every viewer: joined
Like/Dislike, Share, Save, and More; Follow belongs beside the channel. More
holds queue, playlist, download, report, and management actions as permissions
allow, without duplicating Share or the Save/Watch later destination. The row
wraps at narrow widths, with 44px targets and no horizontal swipe requirement.
Guests see an Add a comment button instead of an editable composer. Protected
actions open a contextual sign-in dialog only after activation, preserve the
local watch path/query/hash through login, and never replay the action after
sign-in. Public sharing and creator support remain available without a session.

## Accessibility baseline (unchanged contract, do not regress)

- Skip-to-content link → `#main-content`.
- `.focus-ring` on every interactive element (`:focus-visible` only). Controls
  that hide the native ring must add it (`has-[:focus-visible]:ring-2` for
  wrapped inputs).
- `fg-subtle` NEVER carries meaning: placeholders, secondary text, inactive
  tabs all use `fg-muted` or stronger.
- Icon-only controls: `IconButton` or explicit `aria-label`.
- Route-mocked Playwright asserts roles/names/text — keep accessible names
  stable when restyling (`"Primary"`, `"Search videos"`, `"Sign in"`,
  `"Sort videos"`, headings, etc.).
- axe (serious/critical) gate over home/watch/login/settings/studio/messages/
  admin.

## Testing

- RTL component-unit tests for primitives (vitest + jsdom).
- Mocked Playwright is the integration layer; `e2e/mobile-nav.spec.ts` pins
  the bottom-tab contract, `e2e/sidebar.spec.ts` the sidebar, and
  `e2e/responsive.spec.ts` the no-overflow rule. `e2e/apple-ux.spec.ts` verifies
  visible feed hierarchy, the navigation material, narrow-width reflow, and
  the 44px phone target floor.

## i18n readiness (`lib/i18n`)

Unchanged seam: externalized strings go through `t()` + `lib/i18n/en.ts`
(includes `theme.*` keys). Feature copy is still inline English by design;
new shared-primitive strings must use the catalog.
