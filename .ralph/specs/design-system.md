# Vidra User — Design System

> Status: **PREMIUM REDESIGN LANDED** (template-faithful shell + tokens + theme
> switching). Visual source of truth: the Vidra design templates
> (`Vidra App.dc.html`, `Vidra Desktop.dc.html`, `Vidra Admin.dc.html`,
> `Vidra Desktop Admin.dc.html`) and this spec. Every UI change MUST conform to
> this document — it is a Ralph guardrail, not a suggestion.

## Design philosophy — Apple HIG, quiet luxury

The design follows Apple's Human Interface Guidelines
(https://developer.apple.com/design/): **clarity** (type and spacing carry the
hierarchy), **deference** (monochrome chrome defers to the content —
thumbnails and video are the only saturated things on screen), and **depth**
(hairline borders + subtle elevation, never heavy shadows). The palette is a
zinc monochrome with a near-black accent; status colors are reserved for
status. If a change adds a new saturated color to chrome, it is wrong.

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

| Token utility | Meaning | Light | Dark |
|---|---|---|---|
| `canvas` | page background | `#ffffff` | `#0a0a0a` |
| `surface` | cards, panels | `#ffffff` | `#18181b` |
| `surface-muted` | hover fills, subtle panels, chips | `#f4f4f5` | `#1f1f23` |
| `surface-strong` | progress tracks, pressed fills | `#e9e9eb` | `#2b2b30` |
| `surface-raised` | popovers, menus, sheets | `#ffffff` | `#1f1f23` |
| `fg` | primary text | `#18181b` | `#f4f4f5` |
| `fg-muted` | secondary text — **AA on every surface** | `#65656e` | `#a1a1aa` |
| `fg-subtle` | **decorative only** (never meaningful text) | `#a1a1aa` | `#71717a` |
| `border` | inputs, outlined buttons | `#d4d4d8` | `#3f3f46` |
| `border-subtle` | hairline dividers | `#e8e8ea` | `#26262a` |
| `accent` / `accent-fg` | primary action (monochrome) | `#18181b` / `#ffffff` | `#f4f4f5` / `#18181b` |
| `focus` | focus ring | `#71717a` | `#a1a1aa` |
| `danger` | danger **text/icons** | `#c81e1e` | `#f87171` |
| `danger-solid` / `danger-fg` | danger **fills** (buttons) | `#dc2626` / white | same |
| `danger-surface` / `danger-border` | danger panels | `#fef2f2` / `#fecaca` | `#450a0a` / `#7f1d1d` |
| `success` | positive text/icons/badges | `#166534` | `#22c55e` |
| `warning` | caution text/icons/badges | `#92400e` | `#f59e0b` |
| `live` | the LIVE pulse dot (sits on media) | `#ff453a` | `#ff453a` |

Contrast contract (verified): `fg`/`fg-muted` pass AA (≥4.5:1) on `canvas`,
`surface`, `surface-muted`, and `surface-strong` in both schemes; `danger`
passes as text on `canvas`/`surface`/`danger-surface`; `success`/`warning`
pass on `canvas`/`surface`/`surface-muted` AND inside their own 15% tint
pills (`bg-success/15 text-success`, `bg-warning/15 text-warning`) — axe
verifies this, so never lighten these tokens without recomputing the tinted
pairs. Use `text-danger` for danger text and `bg-danger-solid text-danger-fg`
for danger fills — never `bg-danger`.

**Documented exceptions** (the only allowed non-token colors):
- **Media overlays** — badges/scrims painted ON TOP of thumbnails or video are
  theme-invariant: `bg-black/60 text-white` (duration), `bg-black/55
  backdrop-blur` pills (LIVE, IPFS), `bg-black/45` dialog scrim, white progress
  bars on media. They sit on imagery, not on themed surfaces.
- **QR codes** — always dark modules on a white padded tile (scanability).

## Typography

System stack (`--font-sans`): `-apple-system, BlinkMacSystemFont, "SF Pro
Text", …` — SF Pro on Apple platforms, native elsewhere, zero webfont cost.
Mono (`--font-mono`): `ui-monospace, "SF Mono", …` for stream keys, wallet
addresses, code.

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
| Buttons, chips, pills, search field, avatars, badges | `rounded-full` |
| Inputs, textareas, selects | `rounded-xl` |
| Thumbnails | `rounded-xl` (dense lists: `rounded-lg`) |
| Cards, panels, modals, grouped settings lists | `rounded-2xl` |
| Feature thumbnails / hero media (feed) | `rounded-2xl` |
| Bottom sheets | `rounded-t-3xl` |
| Menu items inside popovers | `rounded-lg` |

## Component patterns (from the templates)

- **Chips / segmented filters** (Recent · Popular · Trending): pill buttons —
  active `bg-accent text-accent-fg border-accent`, inactive `border-border
  text-fg-muted` with `hover:bg-surface-muted`. Group carries
  `role="group"` + `aria-label`; buttons use `aria-pressed`.
- **Segmented switcher** (Inbox: Notifications | Messages; ThemeToggle): a
  `bg-surface-muted rounded-full p-1` track with the active segment
  `bg-surface font-semibold shadow-sm rounded-full`.
- **Video card**: thumbnail (`aspect-video rounded-xl`/`2xl`, `bg-surface-muted`
  fallback) with overlay badges (duration bottom-right `bg-black/60`; LIVE
  top-left pill with `bg-live animate-[live-pulse_1.6s_infinite]` dot; IPFS
  pill top area); below: 36px avatar + `font-semibold` 2-line-clamped title +
  `text-fg-muted` meta line (`channel · views · age`).
- **Status badges** (Published / Processing / Draft / In review / Failed):
  `Badge` primitive or uppercase micro-label pills — success/warning/danger
  tokens at `/15` fill with token text, e.g. `bg-success/15 text-success`.
- **Grouped settings rows** (mobile settings): a `bg-surface-muted rounded-2xl
  overflow-hidden` group, rows `divide-y divide-border-subtle`, each row
  label + optional `text-fg-muted` sub-line + chevron; group headers
  `text-xs font-bold uppercase tracking-[0.06em] text-fg-muted`.
- **Channel header**: banner block, overlapping `rounded-full` avatar with
  `border-canvas` ring, name `font-bold tracking-tight`, pill actions
  (Follow = accent fill when not following; outlined "Following" when
  following).
- **Empty/error states**: the `EmptyState` / `ErrorState` primitives (dashed
  `rounded-2xl` panel; danger-surface panel).
- **Dialogs**: `Modal` primitive (`rounded-2xl`, `bg-black/45` scrim). Bottom
  sheets on mobile may extend it later — same a11y contract.

## Motion

Fast and quiet: `transition-colors` on interactive fills (~150ms default),
`live-pulse` keyframes for LIVE dots, spinners for progress. No parallax, no
bounce, nothing longer than ~200ms. `prefers-reduced-motion` is neutralized
globally in `globals.css` — components never branch on it.

## Component primitives (`components/ui/`)

Import from the barrel `@/components/ui`. All primitives are token-driven and
carry the a11y contract (see their doc comments): `Button`/`LinkButton`
(pill, variants primary/secondary/danger/ghost), `IconButton` (round,
label required), `Input`/`Textarea`/`Select` (rounded-xl, label/hint/error
wiring), `Checkbox`/`Radio` (native), `Toggle` (`role="switch"`), `Modal`
(focus trap/restore, Escape, scrim), `Dropdown` (menu-button pattern), `Tabs`
(WAI-ARIA tabs), `Toast` (live regions), `Card`, `Badge`, `Avatar`,
`Skeleton`, `Spinner`, `EmptyState`, `ErrorState`, `LoadMoreButton`.
Custom components, not UI-kit wrappers. Do not fork these patterns locally.

## App shell

- `Header` — brand, centered pill `SearchBox` (hidden < `sm`; Search is a tab
  there), pill Create → `/studio` (hidden < `sm`), `NotificationsBell`,
  `AccountMenu`. Sticky, `bg-canvas/80 backdrop-blur`, hairline bottom border.
- `Sidebar` (≥ `sm`) — every primary destination + role-gated
  Moderation/Admin, `aria-current="page"`, collapsible icon rail (persisted).
- `BottomTabBar` (< `sm`) — Home / Search / Create / Inbox / Library, sticky
  bottom, in-flow (never overlaps content), unread dot on Inbox,
  `aria-current` on the active tab, safe-area padded.
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
  `e2e/responsive.spec.ts` the no-overflow rule.

## i18n readiness (`lib/i18n`)

Unchanged seam: externalized strings go through `t()` + `lib/i18n/en.ts`
(includes `theme.*` keys). Feature copy is still inline English by design;
new shared-primitive strings must use the catalog.
