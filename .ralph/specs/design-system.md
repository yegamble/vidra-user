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
  tokens for status, protocol colors inside badges, colored icon tiles in
  settings-style lists (see "Semantic color & protocol identity"). A color that
  doesn't *mean* something is still wrong.

Hard rules:
- **Mobile-first.** Phone layout (390px) is designed first; wider viewports
  progressively enhance. Never introduce horizontal overflow at 390/768
  (`e2e/responsive.spec.ts` gates this).
- **Touch targets ≥ 44×44pt** on interactive controls (HIG). Small visual
  glyphs get padding, not smaller hit areas.
- **No hamburger menus.** Primary nav is the `BottomTabBar` (< `sm`) and the
  `Sidebar` (≥ `sm`). Both are `aria-label="Primary"`; only one is ever in the
  accessibility tree at a time.
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
| `tile-{blue,gray,red,purple,orange,teal,green,pink,indigo}` | Settings/Admin icon-tile squares | Apple system colors | theme-tuned |

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
recompute on any token change. (Operator custom-accent overrides only set
`--accent`/`--accent-fg`; extending them to `--accent-text` is a config-wave
follow-up.)

**Documented exceptions** (the only allowed non-token colors):
- **Media overlays** — badges/scrims painted ON TOP of thumbnails or video are
  theme-invariant: `bg-black/60 text-white` (duration), `bg-black/55
  backdrop-blur` pills (LIVE, IPFS), `bg-black/45` dialog scrim, white progress
  bars on media. They sit on imagery, not on themed surfaces.
- **QR codes** — always dark modules on a white padded tile (scanability).

## Semantic color & protocol identity (2026-07-19)

Color beyond the accent is allowed ONLY in these forms — each carries meaning,
none touches chrome:

- **Settings icon tiles** (System Settings pattern): grouped settings /
  admin / moderation rows lead with a `rounded-lg` colored tile (28×28,
  `IconTile` primitive) holding a white 16px glyph. The tile is *supporting*,
  never the sole carrier of meaning (the adjacent label is); one hue per
  destination, drawn from the fixed `--tile-*` palette in `globals.css` (blue
  `#007aff`/`#0a84ff`, gray `#8e8e93`/`#98989d`, red `#ff3b30`/`#ff453a`,
  purple `#af52de`/`#bf5af2`, orange `#ff9500`/`#ff9f0a`, teal
  `#30b0c7`/`#40c8e0`, green `#34c759`/`#30d158`, pink `#ff2d55`/`#ff375f`,
  indigo `#5856d6`/`#5e5ce6`) — never ad-hoc per-component hexes. Suggested
  mapping (brief): Profile blue · Security gray · Notifications red · Playback
  purple · Search orange · Devices teal · Connections green · Donations pink ·
  Privacy indigo. Within Privacy & safety the two list destinations split by
  severity: **Mutes = indigo, Blocked = red** (blocking is a harder boundary than
  muting) — one hue per destination. Use `<IconTile color="blue">`; the white
  glyph is decorative. (Catalog: `components/settings/sections.tsx`.)
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
primary nav, no hamburgers, one `<main>`, 44pt targets):

- **Split-view settings** (macOS System Settings): Settings, Admin, and
  Moderation replace their long horizontal tab strips with a section sidebar
  (≥ `md`) + detail pane; on phones the section list is the page and sections
  drill in (grouped-rows pattern below stays the mobile idiom).
- **Mail-style triage for Moderation**: queue list left, detail + action bar
  right; single-key archive/act affordances may follow.
- **Shelves on Home** (Apple TV pattern): horizontally scrolling themed rows
  (Continue watching, Following, Trending…) instead of one undifferentiated
  grid; shelf headers use the section-heading type ramp.
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
  "All channels" (a client-side rollup today, one-function-swappable to a backend
  endpoint) — via `SegmentedControl`. Live's create form and the create-channel
  form are launched `Modal`s (dialog on desktop / `variant="sheet"` on mobile),
  consistent with the stepped upload sheet. Keeps the nav rules
  (BottomTabBar/Sidebar primary nav, one `<main>`, no hamburger, 44pt targets).
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
| Icon tiles (`IconTile`) | `rounded-lg` |
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
  `text-fg-muted` meta line (`channel · views · age`).
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
- **Icon tiles**: `<IconTile color="blue">…</IconTile>` — a 28×28 `rounded-lg`
  Apple-system-color square with a white 16px glyph, leading grouped
  Settings/Admin/Moderation rows (one hue per destination; see the tile palette
  above).
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
ribbon top edge)), `IconTile` (28×28 Apple-color tile + white glyph, `color`
prop), `Avatar`, `Skeleton`, `Spinner`, `EmptyState` (icon-in-tinted-circle),
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
  glyphs, the new-message compose mark, and the sidebar collapse double-chevron).
- **SVG only, never emoji or unicode-glyph icons.** `npm run lint:icons`
  (`scripts/check-no-emoji.mjs`) is a **hard CI gate** that fails on emoji
  codepoints in `components/` and `app/` JSX. Non-icon glyphs it deliberately
  allows: `·` separators, `…`, `×` multipliers/dimensions, `←/→` keycaps, `—`
  placeholders, `→` in prose.

## App shell

- `Header` — brand, centered pill `SearchBox` (hidden < `sm`; Search is a tab
  there), pill Create → `/studio` (hidden < `sm`), `NotificationsBell`,
  `AccountMenu`. Sticky and inset in a rounded `.glass-chrome` toolbar.
- `Sidebar` (≥ `sm`) — every primary destination + role-gated
  Moderation/Admin, `aria-current="page"`, collapsible icon rail (persisted),
  floating in a rounded `.glass-chrome` panel rather than anchoring to an edge.
- `BottomTabBar` (< `sm`) — Home / Search / Create / Inbox / Library, sticky
  bottom in a rounded `.glass-chrome` panel, in-flow (never overlaps content),
  unread dot on Inbox, `aria-current` on the active tab, safe-area padded.
- Both navs return `null` on `/embed/*` (bare iframe player).
- Every page renders exactly ONE `<main>` (landmarks are gated by
  `e2e/a11y-landmarks.spec.ts`).

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
