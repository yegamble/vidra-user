# Design Refresh Spec — vidra-user × "Vidra streaming platform design"

Date: 2026-07-07. Sources: user-supplied design files saved verbatim at
`/Users/yosefgamble/.claude/jobs/ba84d0be/tmp/design-refresh/unpacked/`
(`Vidra App.dc.html`, `Vidra Desktop.dc.html`, `Vidra Admin.dc.html`,
`DESIGN-NOTES-index.md`). The same files are already vendored in-repo at
`/Users/yosefgamble/github/vidra/vidra-user/.ralph/design-templates/` — they are the
SOURCE of the W0 canonical template JPEGs (verified by visual comparison of
`.ralph/specs/design/app-template.jpeg` / `desktop-template.jpeg` against the rendered
markup: identical screens, identical content).

Security note: the design files were treated as data. They contain templated markup +
a JS demo-state class; nothing in them reads like instructions to an AI. No
prompt-injection content found.

User's directive: adopt this design; stop using emojis for icons; use feather-style SVGs.

---

## 0. Headline finding — this is NOT a token migration

The design's own index states it is "grounded in the vidra-user token system (zinc
semantic tokens, Apple-inspired, monochrome accent)". Value-by-value comparison against
`/Users/yosefgamble/github/vidra/vidra-user/app/globals.css` confirms it: **every design
CSS var maps 1:1 onto an existing semantic token, and 24 of 28 values are already
identical.** The four deltas are all light-mode colors where the current tokens are
deliberately darker than the design's raw zinc/red/green/amber to pass WCAG 2.2 AA —
and in each case the DESIGN value fails AA where the app uses it as text. Per the
load-bearing constraint (light-dark() tokens, data-theme, axe gates stay), **we keep the
current AA-compliant values and change zero token values.** The refresh lands entirely as
component restyles, new surfaces, and the icon migration.

The design uses `data-vtheme` + duplicated light/dark blocks (a mockup convenience);
production keeps `light-dark()` + `color-scheme` + `data-theme` exactly as-is.

---

## 1. Design inventory (from the .dc.html files)

### Palette (canonical, identical across all screens)

Light: `--bg #ffffff · --sur #ffffff · --sm #f4f4f5 · --sm2 #e9e9eb · --fg #18181b ·
--fgm #71717a · --fgs #a1a1aa · --bd #d4d4d8 · --bds #e8e8ea · --acc #18181b ·
--afg #ffffff · --dng #dc2626 · --ok #16a34a · --wrn #d97706`
Dark: `--bg #0a0a0a · --sur #18181b · --sm #1f1f23 · --sm2 #2b2b30 · --fg #f4f4f5 ·
--fgm #a1a1aa · --fgs #71717a · --bd #3f3f46 · --bds #26262a · --acc #f4f4f5 ·
--afg #18181b · --dng #ef4444 · --ok #22c55e · --wrn #f59e0b`
Fixed: LIVE dot `#ff453a` (both schemes, on media). Media overlays: `rgba(0,0,0,.45–.7)`
+ `backdrop-blur`, white text (theme-invariant). Status-tint pills:
`color-mix(in oklab, <status> 15%, transparent)` + status text.

### Typography

`-apple-system, 'SF Pro Text', system-ui, sans-serif` (matches current `--font-sans`);
`ui-monospace, 'SF Mono', monospace` for addresses/stream keys/audit codes/timestamps.
Scale: 34px/700/-0.05em auth wordmark · 26px/700/-0.04em mobile page titles ·
22–24px/700/-0.03em section titles · 19–17px/700 watch titles · 15–13.5px/600 item
titles · 13–12.5px muted metadata · 12px/700/+0.06em UPPERCASE group labels (fgs) ·
11.5px/700/+0.05em UPPERCASE table headers · 10.5px/700/+0.04em UPPERCASE status pills.
`font-variant-numeric: tabular-nums` on ALL stats, durations, percentages, counts.
Negative tracking on every heading (-0.01 to -0.05em, size-proportional).

### Shape language

Cards/grouped lists 14–16px · thumbs 8–14px (scaled to size: 8–9 dense rows, 10–11
mid, 14–16 hero) · pills/buttons/avatars/search(desktop)/toggles 99px · inputs 12px ·
segmented control track 10px / segment 8px (admin variant 9/7) · TOTP boxes 11px ·
bottom sheets 22px top · desktop dialog 20px · duration/res chips 5–6px · dashed
dropzone 18px. Maps cleanly onto the current Tailwind scale: rounded-2xl cards,
rounded-xl inputs/thumbs, rounded-lg dense thumbs, rounded-full pills, rounded-t-3xl
sheets — current design-system.md radius rules already match; segmented controls are
the one divergence (see §3).

### Surfaces & card treatment

Borderless. Cards are `--sm` (surface-muted) fills with NO border and NO shadow;
grouped lists are one `--sm` card with `1px --bds` row dividers (iOS inset style).
Shadows appear ONLY on: active segmented segment (`0 1px 4px rgba(0,0,0,.12)`), toggle
knobs, overlapping channel avatars, desktop dialogs (`0 24px 60px rgba(0,0,0,.3)`).
Feed cards sit directly on canvas (thumb + text, no container). Dividers `--bds` for
list rows/section splits.

### Shell / nav

- Mobile app: 5-tab bottom bar (Home/Search/Create/Inbox/Library), 23px icons + 10px
  labels, active `--fg` / inactive `--fgs`, border-top `--bds`; Create opens a bottom
  sheet (Upload / Go live / Open Studio). Top row: 26px "Vidra" wordmark + bell (dot
  badge) + 30px avatar button.
- Desktop: 58px header (wordmark · centered 420px pill search · outlined "+ Create"
  pill · bell · avatar) over 216px sidebar (Home/Trending/Subscriptions/Library/
  History/Messages/Studio + FOLLOWING with live dots), rows rounded-9, active
  `--sm` fill.
- Mobile admin: same tab-bar pattern (Overview/Users/Queues/Content/Instance), red
  count badge on Queues.
- Desktop admin (per DESIGN-NOTES-index.md): 230px sidebar, "Vidra ADMIN" wordmark,
  16px icons, red count badge, admin identity card pinned at bottom.

### Component vocabulary

Pill buttons (primary `--acc/--afg`; tonal `--sm/--fg`; outline `1px --bd`,
transparent; danger-outline `1px color-mix(--dng 45%)` + `--dng` text) · full-width
rounded-xl form buttons · segmented controls (rect track+shadowed active) · 46×28
toggle switches (on = `--fg` fill, 24px `--bg` knob) · status pills (uppercase micro,
15% tint bg) · role pills (ADMIN = fg-on-bg inverse, MOD = `--sm2`/`--fgm`) · filter
chips (active = accent-filled pill, inactive = outlined) · media-overlay chips
(LIVE/duration/IPFS/watching) · dot indicators (6–8px, ok/wrn/dng/fgs) · progress
bars (5–6px, `--sm2` track, `--fg` fill; white-on-media variant) · message bubbles
(18px radius, 6px tail corner; outgoing accent) · bordered inputs (rounded-xl, error =
`--dng` border) · mono code fields with copy buttons + blur-toggle stream key · TOTP
digit boxes · bottom sheets with 36×4 grab handle · desktop modal 440px/20px · QR on
white tile (exception, like current) · audit rows (mono timestamp + bold actor + mono
event code) · admin data table (grid columns, uppercase headers, 0.55-opacity
deactivated rows).

### Icon system

All inline feather-style SVGs: `viewBox 0 0 24 24`, `stroke=currentColor`,
stroke-width 1.8 default (1.9 desktop sidebar, 2–2.4 at ≤16px, 3 for tiny verified
checks), round caps/joins; deliberate filled exceptions (play, playlist glyph,
more-horizontal, library inner-play). 41 distinct icons extracted with exact paths →
see `icon-inventory.md` in this directory (vendor these paths verbatim).

---

## 2. (a) Token-value diff table

Current = `app/globals.css` (light-dark(light, dark)). Contrast = computed WCAG 2.2
ratios (this package, verified by script).

| Design var | Semantic token | Design (L/D) | Current (L/D) | Verdict |
|---|---|---|---|---|
| `--bg` | `canvas` | #ffffff / #0a0a0a | identical | no change |
| `--sur` | `surface` | #ffffff / #18181b | identical | no change |
| `--sm` | `surface-muted` | #f4f4f5 / #1f1f23 | identical | no change |
| `--sm2` | `surface-strong` | #e9e9eb / #2b2b30 | identical | no change |
| — | `surface-raised` | (n/a — design has no popover token) | #ffffff / #1f1f23 | keep (superset) |
| `--fg` | `fg` | #18181b / #f4f4f5 | identical | no change |
| `--fgm` | `fg-muted` | **#71717a** / #a1a1aa | **#65656e** / #a1a1aa | **KEEP CURRENT.** Design #71717a = 4.40:1 on surface-muted, 3.99:1 on surface-strong — fails AA for the body/metadata text the design sets in it. Current #65656e ≈ 4.8–5.2:1 everywhere. Dark identical. |
| `--fgs` | `fg-subtle` | #a1a1aa / #71717a | identical | no change — but the design sets real metadata (timestamps, hints, 11–12px captions) in fgs (2.56:1 light — fails). The repo rule "fg-subtle is decorative only" WINS: implementers map any design fgs *text* to `fg-muted`, keep fgs for true decoration (inactive tab icons, dots, placeholder glyphs w/ real labels). |
| `--bd` | `border` | #d4d4d8 / #3f3f46 | identical | no change (non-text UI; 1.48:1 is fine for hairlines, current axe config already accepts) |
| `--bds` | `border-subtle` | #e8e8ea / #26262a | identical | no change |
| `--acc` | `accent` | #18181b / #f4f4f5 | identical | no change |
| `--afg` | `accent-fg` | #ffffff / #18181b | identical | no change (17.7:1 / 16.1:1) |
| `--dng` | `danger` (text) | **#dc2626** / **#ef4444** | **#c81e1e** / **#f87171** | **KEEP CURRENT.** Design light #dc2626 = 4.39:1 on surface-muted (fails on the sm cards where danger text sits); design dark #ef4444 = 4.36:1 on dark surface-muted (fails). Current values pass on all surfaces. Design #dc2626 ≡ current `--danger-solid` (fills) — already aligned. |
| `--ok` | `success` | **#16a34a** / #22c55e | **#166534** / #22c55e | **KEEP CURRENT.** Design light = 3.30:1 on canvas / 3.00:1 on surface-muted — fails as text ("End-to-end encrypted", "Ownership proven…", "✓ VERIFIED"). Current #166534 = 7.1:1. Dark identical. |
| `--wrn` | `warning` | **#d97706** / #f59e0b | **#92400e** / #f59e0b | **KEEP CURRENT.** Design light = 3.19:1 canvas / 2.90:1 surface-muted — fails (ClamAV warnings, dead-letter counts are small text). Current #92400e = 7.1:1. Dark identical. |
| LIVE dot | `live` | #ff453a fixed | identical | no change |
| — | `focus`, `danger-solid/-fg/-surface/-border` | (not in design) | keep | superset, unchanged |

Additional contrast flags for implementers (design patterns, not tokens):
- **VERIFIED pill** (design: white on solid `--ok`): 3.30:1 light — fails AA for its
  10.5px text. Land it as the existing tint-pill pattern instead
  (`bg-success/15 text-success` + check icon), consistent with `Badge` success variant
  and the studio status pills. Same for any white-on-warning fills.
- **Status-tint pills** `color-mix(<status> 15%)` + status text: passes with CURRENT
  status colors (this is the documented verified contract in design-system.md); would
  fail with the design's lighter light-mode values — second reason to keep tokens.
- Media overlays (white on `rgba(0,0,0,.55+)` over tints) — fine, existing exception.

**Net: zero token value changes. Gate: axe suite must stay green; no new `dark:`
variants; no raw palette classes.**

---

## 3. (b) Component-level changes per surface

Current implementation facts from `components/` (paths verified). "Design ref" =
screen in the unpacked files. Ordered shell-first (W0 order).

### 3.1 Primitives (foundation slice)

| Component | Current | Change to match design |
|---|---|---|
| `components/ui/Button.tsx` | primary `bg-accent text-accent-fg`; secondary `border border-border bg-surface`; danger solid; ghost | Add **tonal** variant `bg-surface-muted text-fg hover:bg-surface-strong` (the design's dominant secondary: watch actions, source toggle). Add **danger-outline** variant (`border border-danger/45 text-danger bg-transparent`) for Remove/Reject/Delete/Cancel-upload. Keep existing variants (outline ≈ current secondary). |
| Segmented control (`ThemeToggle.tsx`, `FeedScopeToggle.tsx`, inbox/queues/content tabs) | rounded-FULL track `bg-surface-muted p-1`, active `bg-surface shadow-sm` | **New shared `SegmentedControl` primitive**: rounded-[10px] track `bg-surface-muted p-[3px]`, segments rounded-lg, active `bg-canvas shadow-[0_1px_4px_rgba(0,0,0,0.12)] font-semibold`, count suffix in `text-fg-muted`. Migrate ThemeToggle + FeedScopeToggle + new Inbox/Queues/Content tabs to it. (Design shows NO pill-shaped segmented controls.) |
| `components/ui/Toggle.tsx` | h-6 w-11, on `bg-accent`, thumb `bg-surface` | Resize to design: h-7 w-[46px] (24px knob), on `bg-accent` (≡ design `--fg` — same monochrome), knob `bg-canvas shadow`, travel 2px→20px. Keep role="switch". |
| `components/ui/Badge.tsx` | tint variants exist | Add **status** style: uppercase, text-[10.5px], font-bold, tracking-[0.04em], px-2 py-[2.5px] — for PUBLISHED/PROCESSING/IN REVIEW/DRAFT/FAILED and role pills (ADMIN inverse `bg-fg text-canvas`, MOD `bg-surface-strong text-fg-muted`). |
| `components/ui/Modal.tsx` | generic | Desktop dialog skin: w-[440px], rounded-[20px], p-6, `shadow-[0_24px_60px_rgba(0,0,0,0.3)]`, scrim `bg-black/45`. Bottom-sheet skin (mobile): rounded-t-[22px], 36×4 `bg-border` grab handle, `pb-[max(env(safe-area-inset-bottom),2.75rem)]`. |
| `components/ui/Input.tsx` etc. | rounded-xl | Already matches (12px). Error state = `border-danger` + 12.5px danger caption (design signup). |
| `components/icons/index.tsx` | 14 icons, typed, aria-hidden default | Extend to the full 41-icon design set from `icon-inventory.md` (exact paths, stroke-width prop default 1.8). See §7. |

### 3.2 Shell (mobile tab bar, desktop header/sidebar)

Current `BottomTabBar.tsx` / `Header.tsx` / `Sidebar.tsx` already implement the W0
structure. Deltas: adopt the design's exact tab icon paths (home/search/create
plus-square rx6 at 30px/sw1.5/inbox bell/library); tab label 10px/600; Create triggers
the Create bottom sheet (new) instead of navigating; desktop sidebar icons → design
paths at 17px sw 1.9, rows rounded-[9px]; FOLLOWING live dot = pulsing `bg-live`;
header Create pill keeps outlined style; bell dot `bg-danger-solid` with 1.5px canvas
ring (current has ring-2 — fine).

### 3.3 Home / feed

`VideoCard.tsx` already borderless rounded-2xl with duration/IPFS overlays — matches.
Deltas: mobile feed = single column, full-bleed-ish (mx-5) 16px-radius thumbs, title
15.5px/600, meta 13px fg-muted; IPFS chip top-LEFT on mobile, top-RIGHT on desktop,
includes 10×11 cube glyph on mobile; "Live now" horizontal rail (240px cards, LIVE
pill + "N watching" chip) — component exists (`LiveStreamsSection.tsx`), restyle to
rail spec; sort chips already match (`FeedSortTabs.tsx`).

### 3.4 Watch (mobile + desktop) — largest slice

- Player region: mobile edge-to-edge 16/9 with chevron-down minimize button (32px
  black/45 blur circle, top-left); desktop rounded-2xl player. Center play: 56px
  (mobile)/64px (desktop) black/45 blur circle + filled play. Bottom chrome: time
  tabular-nums + CC/quality chips (white/16 5px-radius) + 3–4px white progress.
  Current `player/VideoPlayer.tsx` uses a gradient control bar — restyle to the
  minimal chip style.
- **Player IPFS states** (new): error state (alert-triangle, "Couldn't retrieve this
  video from IPFS", white pill "Re-fetch from IPFS" + white/16 pill "Play from
  server"); fetching state (spinning arc + "Finding peers…" — SEE §5 aspirational
  re peer wording).
- **IPFS source bar** (new, under player, only when video has `ipfs`): status dot +
  label + refresh (rotate-cw) + tonal pill toggle "Use server"/"Use IPFS". See §5.1
  for the buildable subset of labels.
- Actions row: pill buttons w/ 13px icons — **Support (accent-filled, FIRST)**,
  Share, Download, Save (tonal), Report (tonal, fg-muted). Current
  `ShareButton`/`DownloadButton`/`SaveButton`/`ReportButton`/`DonateButton` exist —
  restyle to this row; SaveButton loses ★/☆ (icon sweep).
- Channel row: mobile = surface-muted rounded-[14px] card w/ Follow pill (filled ↔
  outlined toggle); desktop = inline row + Follow + right-aligned actions.
- Desktop description box: surface-muted rounded-[14px], "views · age" bold prefix.
- Comments: heading "Comments · N"; mobile composer = pill field on surface-muted;
  desktop composer = borderline (border-b) field; comment rows 30–34px avatars;
  **collapsed-by-default reply threads**: "View N replies"/"Hide replies" chevron
  toggle (rotates 180°), thread rail `border-l-2 border-border-subtle pl-3/4`;
  **[deleted] tombstone**: author + body in fg-subtle italic, `·` placeholder avatar,
  replies remain. Current `CommentsSection.tsx` renders replies always-expanded —
  add the toggle. **Reply composer/@-attribution: defer to the parallel package**
  (§6). Desktop adds Reply/Report inline links per comment.
- Related rail (desktop): 344px "UP NEXT", 150px thumbs.

### 3.5 Channel

Banner (150px mobile/190px desktop tint) + overlapping avatar (72px, 3px canvas ring,
mobile; 104px/4px desktop) — designer note confirms the overlap is intentional. Action
cluster: Follow pill + 34px icon-circle buttons (heart, message-circle) on mobile;
labeled pills on desktop. Underline tabs Videos/Playlists/About (2px fg underline —
current `ui/Tabs.tsx` accent underline: keep accent≡fg). Grid 2-col mobile / 4-col
desktop, 11px-radius thumbs.

### 3.6 Library / History / Playlists / Search

Library: History rail (170px cards, white 3px progress on thumb) + Playlists rows
(84×48 thumb, filled playlist glyph, name + "N videos · privacy", chevron) + Saved
rows (112px thumbs). Search: field on surface-muted rounded-xl w/ search + x icons;
filter chips (active = accent pill "Tag · photography"); result rows 148px thumbs w/
border-b border-subtle dividers.

### 3.7 Inbox / Messages

Inbox page: SegmentedControl Notifications|Messages. Notification rows: 34px
surface-muted icon circle (design maps each type → icon: video, captions, user-follow,
shield-held, message-circle), bold lead-in + body, unread = surface-muted row bg + 7px
fg dot. Conversations: 44px avatars, lock glyph when E2EE, age right, unread count
pill (`bg-fg text-canvas`). Thread: header w/ back + avatar + name + lock + success
status line ("End-to-end encrypted · disappearing 7d" — see §5 re disappearing);
center pill notice; bubbles rounded-[18px] w/ 6px tail corner (incoming surface-muted,
outgoing accent/accent-fg); attachment bubble w/ file icon; composer: plus circle
(36px surface-muted), pill input, accent send circle (arrow-up). Current
`messaging/*` components exist — restyle pass.

### 3.8 Studio / Upload / Go Live

Studio mobile: back + title + accent Upload pill; storage card (surface-muted
rounded-[14px], 5px progress); video rows (112px thumbs, status Badge, spinner
overlay while processing, more-horizontal); Go live (outline w/ red dot) + Import
from URL buttons. Studio desktop: 4 stat cards (see §5.3 for which stats are real) +
table (uppercase 11.5px headers, grid `1fr 130px 110px 110px 120px 40px`,
border-subtle row dividers). Upload flow: dashed rounded-[18px] dropzone (56px
surface-muted circle + upload icon, "MP4, MOV, WebM, MKV · up to 8 GB", resumable
note); progress card (chunk N of M · 8 MiB chunks); details form (Title/Description
inputs, Privacy+Category selects w/ chevron, tag chips + dashed "+ Add",
Auto-captions + Bluesky toggles — Bluesky see §5); Publish; processing screen
(success check circle, copy, "Back to Studio"). Go Live: title/privacy form;
Permanent stream + Save replay toggles; **stream-key screen**: warning card
("shown only once" bold), RTMP server + key in mono bordered fields w/ copy, key
blur + Hide/Show, Rotate key / Delete stream (outline/danger-outline), "Waiting for
encoder…" surface-muted card w/ fgs dot. Backend contract for all of this EXISTS
(`CreateLiveStreamResponse.stream_key` one-time + `rtmp_url`, `POST /live/{id}/key`).

### 3.9 Settings / Donations / Auth

Settings: profile header (56px avatar, name, @handle · email · verified-in-success);
UPPERCASE 12px fgs group labels; grouped surface-muted rounded-[14px] cards, rows w/
label(+sub fg-muted)(+value right)+chevron; danger rows text-danger; Sign out
full-width outline. Groups per design: Profile / Creator (Donation addresses ·
Bluesky · Linked sign-ins) / Security (2FA · Sessions · Encrypted messaging devices)
/ Data (Export · Import) / Danger zone. Donation settings: per-network cards w/
name + VERIFIED (tint pill + check) or UNVERIFIED (`bg-surface-strong text-fg-muted`)
pill + scope label right; mono address; status caption; dashed "+ Add address".
Support sheet/dialog: QR white tile (86px sheet / 78px dialog) + mono address + copy
w/ "Copied" success feedback + non-custodial disclaimers. Auth: centered 34px
wordmark + tagline; bordered inputs; primary submit; "or" hairline divider; SSO
outline button (backend `oauth_providers[]` real); TOTP screen (52px lock circle,
6 digit boxes 44×52 rounded-[11px], filled boxes border-fg, recovery-code link);
signup w/ inline field error + approval-notice info card (backend
`registration_requires_approval` real).

### 3.10 Admin (mobile app/) + desktop admin

Mobile admin (maps to existing `app/admin/*` + `app/moderation/*` routes): Overview
(eyebrow "instance · Admin", 2-col stat cards 23px tabular-nums — see §5.4; Health
list card w/ dots; Job queues card; audit list w/ mono 11px time + bold actor + mono
event code); Users (search field, filter chips All/Staff/Deactivated, rows w/ role
pills, deactivated 0.5 opacity); User detail (role SegmentedControl, quota card w/
progress + Change/Reset buttons, facts card, Deactivate + Delete danger-outline,
caveat caption); Queues (SegmentedControl Reports/Quarantine/Sign-ups w/ counts;
report cards: kind pill + age + optional "remote · host" + bold target + quoted
reason/reporter + Review/Dismiss/Remove; quarantine cards: 104px thumb + ClamAV dot
status line + Approve & publish / Reject; sign-up cards: @name · email + quoted note
+ Approve/Deny); Content (Videos|Comments; blocked overlay = black/55 + slash icon;
Block/Unblock/Actions pills; comment rows w/ View thread / Delete); Instance
(About / Registration toggles / Features toggles + live-mutation caption /
Operations rows w/ chevrons). Desktop admin per DESIGN-NOTES-index.md: 230px sidebar
shell, 4-stat row, two-col overview, users TABLE (`1.4fr 1fr 110px 130px 120px
90px`), user detail two-col, queue cards max-w-[860px], instance two-col. Backend:
nearly all real — see §5.4/§5.5 for the gaps.

---

## 4. (c) Conflicts with the W0 canonical templates

**Finding: none of substance.** The W0 JPEGs (`.ralph/specs/design/app-template.jpeg`,
`desktop-template.jpeg`) are renders of these very design files (same screens, same
demo content, same badges/layout — visually verified), and the repo already vendors
the .dc.html sources at `.ralph/design-templates/`. The new design is a superset
(more screens: watch, admin, auth, studio flows, DMs), not a contradiction.

Deliberate divergences to record (design-vs-code or design-vs-guardrail, each already
resolved above — new design wins except where the AA gate wins):

1. **Light-mode status/muted colors** — design uses zinc-500/red-600/green-600/
   amber-600; tokens keep the darker AA values (§2). The templates *render* slightly
   lighter than production will. Accepted: AA gate is load-bearing.
2. **Segmented control shape** — current code uses pill-shaped segments; design (and
   templates) use rounded-rect track/segments. Design wins → new primitive (§3.1).
3. **`data-vtheme`** in the mockups vs production `data-theme`/`light-dark()` —
   mockup convenience only; production mechanism unchanged.
4. **fg-subtle as text** — design sets small metadata in `--fgs`; repo rule
   ("decorative only") wins; such text maps to `fg-muted`.
5. **VERIFIED solid-green pill** — design's white-on-green fails AA at that size;
   land as success tint pill (§2).
6. **Toggle proportions** — current 24×44 vs design 28×46 w/ canvas knob; design wins
   (minor).

---

## 5. (d) Aspirational / not-yet-buildable + new-surface backend classification

Contract source: `/Users/yosefgamble/github/vidra/vidra-core/api/openapi.yaml`
(~12,642 lines, canonical, contract-tested). Verbatim findings below.

### 5.1 IPFS watch surface — PARTIAL, largely implementable

Real today (P19 shipped): `Video.ipfs_pinned` (drives card badge — already rendered);
detail `Video.ipfs = { original_cid, hls_cid, gateway_url }`; admin
`GET /api/v1/ipfs/status` (`enabled, node_reachable, gateway_url, cluster_*, pins
{pinned,pending,failed,unpinned}, by_class`) + `POST /api/v1/admin/ipfs/reconcile`.
- **Implementable now**: IPFS badge on cards/watch; source bar with "Use server /
  Use IPFS" toggle where `hls_cid` exists (IPFS playback = HLS via
  `{gateway_url}/ipfs/{hls_cid}` — plain HTTP fetch, hls.js can point at it);
  fetching/error player states driven by real gateway fetch outcomes; "Re-fetch from
  IPFS" (retry) and "Play from server" (source flip); status labels WITHOUT peer
  counts: "IPFS · pinned", "IPFS · fetching…", "IPFS · unavailable — playing from
  server", "Playing from server (HLS)".
- **Aspirational — record as dependency, do NOT stub**: per-video peer counts
  ("pinned · 12 peers", "2 peers reachable", "Finding peers…", "No reachable peers
  are pinning this content") — no peer-count field exists anywhere; true client-side
  P2P (bitswap/libp2p) fetch — no endpoint; spec states IPFS is a mirror sidecar.
  Use peer-free copy ("Couldn't retrieve this video from IPFS" stays fine;
  "Finding peers…" → "Fetching from IPFS…").
- Admin "IPFS gateway" health row: real via `/api/v1/ipfs/status.node_reachable`.

### 5.2 Support / crypto donations — EXISTS, implementable now

`DonationAddress { id, owner_id, channel_id?, network ∈ [bitcoin, ethereum, litecoin,
monero], address, label, verified, created_at }`; manage under
`/api/v1/me/donation-addresses` (+`/{id}/challenge`, `/{id}/verify` — EIP-191,
**ethereum only; others return 501**, which matches the design's "Signature
verification for Bitcoin isn't available yet" copy exactly); public reads
`GET /api/v1/users/{id}/donation-addresses` and
`GET /api/v1/channels/{handle}/donation-addresses`. Design's "Account" vs channel
scope label ≙ `channel_id` null/set. Existing components (`DonateButton`,
`DonationBadge`, `DonationSettingsView`, `settings/donations` route) — restyle +
add the watch/channel Support sheet/dialog with QR (client-generates QR from
address string; `QrCode` component exists).

### 5.3 Studio dashboard stats — mostly real

- Storage: `GET /api/v1/me/quota → { used_bytes, quota_bytes|null }` — real.
- Views/followers: `GET /api/v1/channels/{handle}/stats → { views, likes, dislikes,
  comments, followers, videos, daily_views[30] }` (owner-only) — "Views · 28 days"
  computable from `daily_views`; follower count real. Per-video table views:
  `GET /api/v1/videos/{id}/stats` real.
- **Aspirational**: "↑ 18% vs previous" / "↑ 640 this month" period-over-period
  deltas — the series is 30 days, no prior-period data ⇒ backend-dependent (analytics
  wave). Land the cards without delta lines.
- "Pending jobs" card: no per-user jobs endpoint (admin-only `/admin/jobs`) ⇒ either
  derive client-side from the owner's video list states (processing/queued count) or
  defer; do not call admin endpoints from Studio.

### 5.4 Admin overview — PARTIAL

- Health card: `GET /api/v1/admin/system → SystemStatus` covers postgres + redis (+
  build/uptime/rate limits); IPFS gateway via `/api/v1/ipfs/status`. **Missing:** S3
  health, RTMP-ingest health rows ⇒ render only real rows now; S3/RTMP =
  backend-dependent.
- Job queues card: `GET /api/v1/admin/jobs → queues[] { queue, pending, running,
  done, failed, oldest_pending_age_seconds }` for `transcode_jobs,
  federation_deliveries, import_jobs, caption_jobs, account_exports,
  upload_sessions` — real (incl. dead-letter/failed). **"Bluesky posts" queue: not
  present** (see 5.6).
- Audit log: `GET /api/v1/admin/audit-log` — real (mobile Overview card + existing
  `/admin/audit-log` route).
- 4 stat cards (Users / Published videos / Media stored / Federated peers): **no
  aggregate-counts endpoint found** ⇒ backend-dependent (small `/admin/stats`
  endpoint), or approximate from list-response totals if present (verify at
  implementation; do not fake).

### 5.5 Instance settings & feature toggles — EXISTS with two gaps

`GET/PATCH /api/v1/admin/instance-settings` (typed key/value + default + overridden;
live-mutable). Real keys map 1:1 to the design toggles: `registration_enabled`,
`registration_require_approval`, `uploads_enabled`, `imports_enabled`, `live_enabled`,
`comments_enabled`, `quarantine_new_uploads`; strings `instance_name`,
`instance_description`, `terms_url`, `privacy_url`, `contact_email`. The design's
live-mutation caption ("returns 'feature disabled' … immediately") matches the real
semantics. **Gaps:** "IPFS playback" toggle — IPFS enablement is not an
instance-settings key (boot-time `IPFS_ENABLED`) ⇒ render read-only from
`/ipfs/status.enabled` or omit; "Default storage quota" row — not an
instance-settings key ⇒ backend-dependent. Operations rows: Jobs, System status,
Federation (blocked instances endpoints real), Watched words (real), PeerTube import
(real), Media GC (`POST /admin/media/gc` real) — all wired to existing routes.

### 5.6 Other aspirational items (inspiration only — list, don't stub)

- **Bluesky cross-posting** (upload toggle, settings row, admin queue): no endpoints
  anywhere ⇒ aspirational.
- **Disappearing messages ("disappearing 7d")**: messaging prefs exist but no
  retention/TTL field surfaced ⇒ aspirational (E2EE itself is real and shipped).
- **Live viewer counts** ("1.2K watching", "N watching" chips): no viewer-count field
  on `LiveStream` ⇒ aspirational; land live cards with LIVE badge only.
- **Admin user detail extras**: role/quota override/deactivate/delete are real
  (`PATCH/DELETE /admin/users/{id}`); per-user "Reports against" count, per-user
  videos/channels/live counts, admin revoke-other-user-sessions, "Donation addresses
  2 · 1 verified" fact row — not exposed on the admin user contract ⇒ verify at
  implementation, else backend-dependent; render only real facts.
- **Sessions list for self** ("3 active · sign out everywhere"): verify `settings/
  security` contract at implementation (not confirmed in this pass).
- Watch-history resume % (Library history progress bars): verify history contract
  field; if absent, omit bars (do not fake).
- TOTP/2FA + recovery codes, SSO login, registration approval notice: all REAL
  (`/auth/mfa/*`, `/auth/oauth/*`, `/instance.registration_requires_approval`).

---

## 6. Comment replies & tombstones — coordination note

A separate feature package ("comment reply @username attribution") is being spec'd in
parallel at `/Users/yosefgamble/.claude/jobs/ba84d0be/tmp/comment-reply-attribution/`
(AUDIT.md present as of this writing; spec.md pending). Its audit confirms: backend
threading (`parent_id`) real, reply-to-reply accepted, tombstones real
(`deleted: true`, body "[deleted]", thread preserved) — matching this design's
`[deleted]` vocabulary exactly.

Division of labor: THIS refresh owns the *visual* thread treatment (collapsed
"View N replies" toggle, chevron rotation, `border-l-2` rail, tombstone styling in
fg-subtle italic, Reply/Report inline links). The attribution package owns the reply
*composer affordance and leading @mention*. The watch-page restyle slice must
reference that package's spec rather than restyle the composer twice — whichever
lands second rebases on the first.

---

## 7. Icon migration spec (STEP 4)

### 7.1 Emoji/glyph audit — file:line inventory (complete)

Product source contains exactly **5 emoji/glyph icon call sites (6 distinct glyphs)**
— all already `aria-hidden` decorative:

| # | File:line | Glyph | Meaning | Replacement |
|---|---|---|---|---|
| 1 | `components/RatingControls.tsx:105` | 👍 / 👎 | like / dislike | `ThumbsUpIcon` / `ThumbsDownIcon` (new) |
| 2 | `components/ReportButton.tsx:70` | ⚑ | report flag (pill variant) | existing `FlagIcon` → re-path to design flag (`M4 21V5a1 1 0 0 1 1-1h13l-3 5 3 5H5`) |
| 3 | `components/SaveButton.tsx:71` | ★ / ☆ | saved / not saved toggle | `StarIcon` (new, `filled` prop) — note the design's watch row uses a plus for "Save"; keep star for state toggle unless the watch restyle slice adopts the design's plus+"Save" pill (decide in slice 5; both AA-fine) |
| 4 | `components/PlayerMenu.tsx:149` | ✓ | selected menu item | existing `CheckIcon` |
| 5 | `components/AddToPlaylistButton.tsx:114` | ✓ | added to playlist | existing `CheckIcon` |

NOT icons — do not convert (judgment calls, verified):
`·` metadata separators (~30 files, many already aria-hidden), `…` in loading copy,
`×` as multiplier (`SpeedMenu` "1.5×") and dimensions (`WatchView` "1920×1080"),
`← / →` keycap labels in `KeyboardShortcutsHelp.tsx:9` (keyboard semantics — style as
`<kbd>` at most), `→` in prose ("Settings → Devices"), `—` empty-cell placeholder in
`AdminAuditLogView.tsx:122`, the LIVE dot (CSS element in `ChannelLiveBadge.tsx`).
e2e/ sources: clean.

### 7.2 The Icon component

Extend the EXISTING typed set at `components/icons/index.tsx` (14 icons today:
Search, Close, Check, ChevronDown/Right/Left, Flag, Bell, Menu, Plus, Trash, Info,
Warning, ExternalLink; decorative-by-default `aria-hidden`, `label` prop for semantic
use — contract already correct). Do NOT introduce a new module or a runtime
dependency: `package.json` carries **no icon library** (deps: olm, otel, hls.js,
next, react ×2) and none is needed — vendor inline SVGs as individual components,
exactly as the file already does.

Rules:
- `viewBox="0 0 24 24"`, `stroke="currentColor"`, `fill="none"`, round caps/joins,
  `strokeWidth` prop defaulting to **1.8** (design standard; callers pass 2–2.4 at
  small sizes, 1.9 in the desktop sidebar); `size` prop (px).
- Filled-by-design icons (`PlayIcon`, `PlaylistIcon`, `MoreHorizontalIcon`, library
  glyph) use `fill="currentColor" stroke="none"` on those paths.
- Paths come VERBATIM from `icon-inventory.md` (41 icons — the design files are the
  canonical reference). Where an existing icon's path differs from the design's
  (e.g. Flag, Bell), re-path to the design version so all surfaces converge.
- Accessibility: `aria-hidden="true"` default; when the icon is a control's only
  content, the control provides `aria-label` (current pattern in
  `IconButton`/design mockups) or the icon takes `label` → `role="img"` +
  `<title>`. No behavior change to the existing contract.
- MIT attribution comment for Feather-derived paths at the top of the file.
- Migration sweep also RETIRES drift: `components/e2ee/LockIcon.tsx` folds into the
  shared set; the ~45 components with ad-hoc inline `<svg>`s converge onto the shared
  set opportunistically in their per-surface restyle slices (not a big-bang rewrite —
  each slice swaps the icons of the surfaces it touches).

---

## 8. Evidence & gates (every slice)

- Before/after screenshots (light + dark) at 390px and 1280px for touched surfaces.
- `npm run ci` green (typecheck, lint, unit, e2e incl. axe serious/critical gate,
  responsive overflow, landmarks) — no waivers.
- No new `dark:` variants; no raw palette classes; tokens untouched (§2).
- Push after each slice per repo workflow.
