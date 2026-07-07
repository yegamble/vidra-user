# W1 — Watch & Player Backports: vidra-user spec

**Programme:** `../../.ralph/specs/backport/PROGRAM.md` (monorepo root), wave W1.
**Feature IDs (FEATURE_VISION.md):** PLAY-03 (speed 0.25–4×), PLAY-04 (theater
mode), PLAY-05 (Picture-in-Picture), PLAY-07 (per-user player settings UI),
PLAY-08 (autoplay next + end card), PLAY-09 (keyboard shortcuts), plus the UI
consumers of CORE-15 (chapters), CORE-16 (storyboard hover previews), CORE-17
(video passwords + embed privacy).
**Backend contracts:** `vidra-core/.ralph/specs/backport-w1-watch-player.md`
(this wave's core spec) + the current `vidra-core/api/openapi.yaml`. UI slices
that consume a new endpoint land only AFTER that endpoint is merged (PROGRAM §4
rule 1 — never a UI against a non-existent endpoint).
**Design guardrails:** `.ralph/specs/design-system.md` +
`.ralph/specs/backport-w0-design-parity.md` + the two template JPEGs in
`.ralph/specs/design/`. Tokens only; the ONLY non-token colors allowed inside
the player are the documented **media-overlay exceptions** (`bg-black/60`
scrims, white text/controls ON the video surface).

## The centerpiece: a CUSTOM-BUILT player

This wave's foundational deliverable is a bespoke player. The product owner has
explicitly rejected the current bare native `<video controls>` chrome and any
stock UI kit (video.js etc.). Everything else in W1 hangs off this shell.

### What exists today (build on it, do not duplicate)

- `components/WatchView.tsx` — watch page; native `<video controls>`; watch
  progress + Resume; caption `<track>`s loaded as same-origin blob URLs (keeps
  the media element free of `crossorigin`, preserving Range streaming — KEEP
  this technique).
- `lib/use-hls-playback.ts` — hls.js/native-HLS/progressive mode selection,
  dynamic hls.js import, bounded fatal-error recovery, `levels`/`currentLevel`/
  `setLevel` (today: hard switch via `hls.currentLevel`).
- `lib/hls.ts` — `buildLevelMenu`, `AUTO_LEVEL`, `choosePlaybackMode`.
- `components/QualityMenu.tsx`, `SpeedMenu.tsx` (`PLAYBACK_RATES` 0.25–2×),
  `PlayerMenu.tsx` (menu-button pattern), `StoryboardPreview.tsx` (separate
  scrubber under the player, VTT `#xywh` cue parsing in `lib/storyboard.ts`),
  `KeyboardShortcutsHelp.tsx`, `lib/player-shortcuts.ts` (space/K, J/L,
  arrows, M, F, C + `SHORTCUT_IGNORE_SELECTOR`).
- `components/EmbedPlayer.tsx` — bare `<video controls>` on `/embed/[id]`.
- e2e: `e2e/watch-player.spec.ts`, `e2e/hls.spec.ts`, backed suite under
  `e2e-backed/` (`--project=backend-backed`), axe gate `e2e/a11y.spec.ts`.

### Ideas mined from the archived `vidra-user-bk` player (ADAPT, never copy)

From `src/components/video-player.tsx` + `use-player-{keyboard,chapters,
storyboard}.ts` + `lib/player/constants.ts` (all read 2026-07-07):

- **Layering**: one `relative aspect-video bg-black rounded-2xl overflow-hidden`
  container owning a chrome-less `<video>`, with an absolutely-positioned
  bottom control bar over a `bg-gradient-to-t from-black/80` scrim.
- **Auto-hide**: controls fade after ~3 s idle; pointer move / touch / focus
  re-shows them. (Add what the old player missed: keyboard focus inside the
  bar must pin it visible.)
- **Seek bar**: single track painting played progress, chapter tick markers at
  `start_seconds/duration`, and a hover tooltip anchored at the pointer x
  showing the storyboard sprite region + timestamp.
- **Quality switching**: drive `hls.nextLevel` (smooth switch at the next
  fragment) instead of `hls.currentLevel` (hard flush); keep a
  `pendingQualityLevel` and clear it on `LEVEL_SWITCHED` to show a busy "…"
  state on the label. Auto = `-1`.
- **PiP**: gate on `document.pictureInPictureEnabled`; reflect state via
  `enterpictureinpicture`/`leavepictureinpicture` events; `i` shortcut.
- **Theater**: a small context/provider so the page layout (not the player)
  reacts; `t` shortcut; `aria-pressed` on the toggle.
- **Keyboard**: ArrowUp/Down volume ±5 %, `<`/`>` step the speed ladder, 0–9
  decile seek, Home/End, `,`/`.` frame-step while paused.
- **Speed ladder**: `[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4]`.

**Old-player defects we must NOT replicate** (each is a review-blocking defect
here): hardcoded `cyan-400` accent and ad-hoc white/opacity styles beyond the
media-overlay exceptions; seek bar `role="slider"` with `tabIndex={-1}` (not
keyboard operable); popover menus without focus management/Escape/arrow keys;
control hit areas well under 44 pt; `crossOrigin="anonymous"` on the media
element (breaks the blob-URL caption approach and Range behavior); no buffered
ranges; `stopPropagation` swallowing events globally.

---

## W1.U1 — Custom player shell (foundational; PLAY-02 surface, prerequisite for all below)

**Component:** `components/player/` — a `VideoPlayer` shell that replaces the
native-controls `<video>` inside `WatchView` AND `EmbedPlayer` (embed gets the
same shell minus theater). The shell owns the `<video>` element (no `controls`
attribute) and exposes the element ref upward (Share dialog reads
`currentTime`; watch-progress reporting stays in WatchView).

**Required controls, all in the overlay bar (media-overlay styling zone —
white-on-scrim, per the documented design-system exception):**

1. **Play/Pause** toggle (also: click/tap on the video surface toggles; double
   activation must not double-fire).
2. **Seek bar**:
   - played progress + **buffered ranges** (from `video.buffered`) painted as a
     lighter band under the playhead line — white fills on media, no new hues;
   - pointer seek (click + drag/scrub), hover tooltip (time; storyboard frame
     when available — W1.U4 fills this in);
   - keyboard: `role="slider"`, `tabIndex={0}`, `aria-label="Seek"`,
     `aria-valuemin/max/now` + `aria-valuetext="1:23 of 12:40"`, ArrowLeft/
     Right ±5 s, Home/End; focused slider shows the tooltip for the playhead
     (keyboard parity with hover).
3. **Volume**: mute toggle + horizontal slider (`aria-label="Volume"`), ±5 %
   via ArrowUp/Down on the slider; mute state and level are session-local.
4. **Time readout** `current / duration`, `tabular-nums`.
5. **Captions toggle/menu**: reuses the existing blob-URL `<track>` loading;
   off / one entry per track; `aria-pressed` on the toggle.
6. **Settings cluster** (each a `PlayerMenu`-style menu-button with real menu
   semantics — focus moves in, arrows navigate, Escape closes and returns
   focus):
   - **Speed** (W1.U2 ladder),
   - **Quality** — REQUIRED, see below,
   - **Theater** (watch page only) and **PiP** toggles (W1.U3),
   - **Fullscreen** (on the container, so the custom chrome stays visible in
     fullscreen — the old player got this right by fullscreening the
     container, not the `<video>`).
7. Auto-hide behavior as mined above; controls always visible while paused,
   while a menu is open, or while focus is inside the bar;
   `prefers-reduced-motion` users get opacity swap without transition (the
   global neutralization already handles this — do not branch manually).

**HLS QUALITY/RESOLUTION SELECTOR (explicit requirement).** The user cannot
switch resolutions on uploaded videos today; the selector is a first-class W1
deliverable:
- Entries: **Auto** + one per rendition from `hls.levels`
  (`buildLevelMenu`), tallest first, labels `"1080p"`, `"720p"`, ….
- Selection drives `hls.nextLevel` (adapt `use-hls-playback` from
  `currentLevel` to `nextLevel` + `LEVEL_SWITCHED` pending-state — record this
  as a deliberate behavior change: smooth switch instead of buffer flush).
- Label shows the pending "…" state until `LEVEL_SWITCHED`; while on Auto, the
  label may show the active rendition, e.g. `Auto (720p)`.
- Hidden in native-HLS/progressive modes (nothing is controllable there),
  exactly as today.
- **Dependency (recorded):** real multi-rendition switching requires the
  backend ladder to emit >1 rung — a separate investigation is running;
  vidra-core W1.C0 pins that contract. The selector UI is verified against a
  **synthetic multi-rendition master playlist in the mocked e2e** (extend
  `e2e/hls.spec.ts` fixtures), so this slice is NOT blocked by the
  investigation; the backed e2e asserts whatever rung count the real pipeline
  produces and must flip to ≥2 assertions once the investigation closes.

**Design:** container `rounded-2xl overflow-hidden bg-black`; controls sit on
scrims per the media-overlay exception; every control ≥ 44×44 pt hit area,
`.focus-ring`, `IconButton`-equivalent accessible names. NOTHING else in the
player may use raw colors — menus that render OUTSIDE the media surface (none
planned) would use tokens. Templates win for layout; design-system wins for
tokens (W0 rule 5).

**A11y (hard gate):** full keyboard operability of every control including the
seek and volume sliders and all menus; focus never lost when the bar
auto-hides (hide is visual only — `opacity`, not `display`, while focus is
inside; or focus pins the bar); shortcuts (W1.U8) never fire from form fields
or open menus (`SHORTCUT_IGNORE_SELECTOR` respected); axe serious/critical
zero on `/videos/[id]`.

**Tests:** unit (RTL) for the shell's state machine (play/pause, seek math,
buffered painting, auto-hide timer, menu open/close); mocked e2e rewrite of
`e2e/watch-player.spec.ts` (custom buttons drive `video.paused`,
`playbackRate`, `currentTime`, fullscreen container, captions `mode`), quality
menu against the synthetic 3-rung manifest; keyboard-operability spec (tab
order, slider keys); axe. Backed e2e: the existing upload→watch pipeline spec
passes with the custom chrome (playback of a real transcoded video).

**Non-goals:** video.js/plyr/any player library; P2P/IPFS indicators
(P2P-02); loop control; mini-player.

---

## W1.U2 — PLAY-03 · Playback speed 0.25×–4×

- Extend `PLAYBACK_RATES` to the mined ladder
  `[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4]` (single shared
  constant — the settings UI in W1.U6 and the backend validation in core
  W1.C3 use the same ladder; keep in lockstep).
- Speed menu lives in the shell's settings cluster; current rate on the
  button (`1×`, `1.5×`); applies via `playbackRate` + `defaultPlaybackRate`
  (re-applied on src change, as today).
- `<` / `>` shortcuts step down/up the ladder (W1.U8 wires the keys; the
  stepping helper lands here with unit tests).
- e2e: select 4× → `video.playbackRate === 4`; persists across an HLS→original
  fallback within the same page.

## W1.U3 — PLAY-04 · Theater mode + PLAY-05 · Picture-in-Picture

**Theater (watch page only):**
- Toggle in the shell + `t` shortcut; `aria-pressed`; icon per templates.
- Active: the player column expands to the full content width and the
  `RelatedVideos` rail drops below the metadata block (CSS/layout change in
  `WatchView`; no route change). Inactive: current two-column layout.
- Persistence: session-only (`sessionStorage["vidra.theater"]`) in this slice;
  W1.U6 adds the signed-in `theater_default`. (Deviation from the upstream
  plan's `?theater=1` URL param — recorded; URL params leak into shares.)
- e2e: toggle → rail moves below (layout assertion) → reload in same tab keeps
  the mode; axe in theater mode.

**PiP:**
- Button in the shell + `i` shortcut; hidden when
  `document.pictureInPictureEnabled` is falsy (not disabled — hidden).
- `aria-pressed` mirrors `enterpictureinpicture`/`leavepictureinpicture`
  events (covers PiP started/ended from browser UI).
- Unit test stubs `requestPictureInPicture`/`exitPictureInPicture`; mocked e2e
  asserts button visibility gating.

## W1.U4 — CORE-15/16 · Chapters + storyboard previews in the seek bar
*(consumes core W1.C1; storyboard endpoints already live)*

**Chapters (viewer):**
- When the detail has `has_chapters`, fetch
  `GET /api/v1/videos/{id}/chapters` (`{chapters:[{start_seconds,title}]}`).
- Seek bar renders a tick/segment boundary per chapter; hovering (or focusing)
  a region shows the chapter `title` in the seek tooltip; the current chapter
  title renders beside the time readout (muted, truncated).
- Chapter markers are pointer targets ≥ 44 pt tall (visual tick can be small;
  hit area cannot) and are reachable by keyboard via the slider itself (the
  tooltip announces the chapter through `aria-valuetext`:
  `"3:12 of 12:40 — Intro"`).

**Chapters (creator):** editor in the studio video edit surface
(`app/studio/[id]`): rows of `start (m:ss)` + `title`, add/remove, client-side
validation mirroring the contract (ascending, < duration, 1–120 chars, ≤ 100),
save via `PUT /videos/{id}/chapters` (whole-set replace). Design: grouped
rows/`Input` primitives per design system — no bespoke form styles.

**Storyboards:** fold the existing `StoryboardPreview` cue logic
(`lib/storyboard.ts`, VTT `#xywh` regions — NOT the backup's JSON metadata
math, which matched a contract we do not serve) into the shell's seek tooltip:
hover/focus shows the sprite region + timestamp (+ chapter title when
present). The separate under-player scrubber strip is then removed — its
accessible seeking duty moves to the now keyboard-operable seek bar. Keep
`has_storyboard` gating and lazy-load the sprite only on first hover/focus.

**Tests:** unit for cue/chapter lookup + validation helpers; mocked e2e:
chapters render as ticks, tooltip shows title + frame, editor validation;
**backed e2e (DB-proof, data-mutating):** studio editor PUTs chapters → assert
the `video_chapters` rows via the API (re-GET) → reload the watch page → ticks
and titles visible after refetch.

## W1.U5 — PLAY-08 · Autoplay next + end-card countdown

- On `ended`: the shell shows an end-card overlay (media-overlay zone):
  next video's thumbnail + title + channel, a visible countdown (default 8 s),
  **Play now** and **Cancel** buttons.
- "Next" = first entry of the already-fetched `RelatedVideos` list (playlist
  context is a non-goal this wave — recorded). No related videos → plain
  replay affordance, no countdown.
- Countdown completion or **Play now** navigates client-side to
  `/videos/[nextId]`. **Cancel** stops the countdown but keeps the card until
  dismissed (replay button + Escape dismisses).
- Honors the effective `autoplay_next` setting (W1.U6; signed-out default
  true, session toggle on the card: "Autoplay is on/off" switch — mirrors the
  per-user setting when signed in, PUTs through W1.U6's wiring).
- A11y: on show, focus moves to **Play now**; countdown announced via a
  polite live region ("Playing next in 8 seconds"); Escape cancels; focus
  returns to the player on dismiss.
- e2e (mocked): force `ended` → card renders, Cancel halts navigation, Play
  now navigates; autoplay-off setting suppresses the countdown.

## W1.U6 — PLAY-07 · Player settings UI (consumes core W1.C3)

- `/settings` gains a **Playback** group (grouped-rows pattern from the design
  system): Autoplay next (Toggle), Default speed (Select over the shared
  ladder), Default quality (Select: Auto + common rungs 2160p/1440p/1080p/
  720p/480p/360p), Captions on by default (Toggle), Theater by default
  (Toggle).
- Wiring: `GET/PUT /api/v1/me/player-settings` (merge-PUT: send only the
  changed field). Signed-out: section hidden; the player uses baked defaults.
- The shell consumes the effective settings on mount: initial speed, initial
  quality (matching rung if present, else Auto), captions default on,
  theater default (watch page).
- **Backed e2e (DB-proof):** toggle default speed to 1.5× → PUT → re-GET shows
  1.5 (server state changed) → open a watch page → `video.playbackRate === 1.5`
  after load; toggle back.
- Unit: settings→player mapping (unknown quality rung → Auto; invalid stored
  speed → 1).

## W1.U7 — CORE-17 · Password-protected videos + embed privacy UX
*(consumes core W1.C2)*

**Watch page unlock flow:**
- `GET /videos/{id}` → 401 `code="password_required"` renders a password
  panel in place of the player (token-styled panel, `Input type="password"`,
  submit button; NOT the generic error state).
- Submit → `POST /videos/{id}/unlock`; wrong password → inline field error
  (401), rate-limit (429) message honored. Success → store the
  `playback_token` in memory (module state alongside the auth store — never
  localStorage), refetch the detail, and play.
- Media/token plumbing: hls.js attaches `Authorization: Bearer <pt>` via
  `xhrSetup`; native-HLS/progressive/poster/storyboard/caption URLs append
  `?pt=` (the API client's URL helpers gain an optional playback-token
  parameter). Navigating away drops the token.

**Studio edit:** privacy select gains **Password-protected**; choosing it
reveals password management (list of existing passwords by created date, add,
replace-all, delete — matching the owner endpoints; deleting the last one is
blocked with the 409 message). Saving privacy=password with no passwords is
prevented client-side and surfaces the server 400 otherwise.

**Embed:**
- `/embed/[id]` runs the same unlock flow inside the iframe (compact panel).
- Embed privacy enforcement in the embed page: fetch
  `GET /videos/{id}/embed-privacy`; `disabled` → "Embedding is disabled for
  this video" panel; `whitelist` → allow only when
  `location.ancestorOrigins`/`document.referrer` host matches
  `allowed_domains` (top-level open of /embed directly is allowed).
- Studio edit gains the embed-privacy control (Enabled / Disabled / Only these
  domains + domain chip input).

**Tests:** mocked e2e for prompt/error/unlock render paths and embed
disabled/whitelist branches; **backed e2e (DB-proof):** studio sets a password
(row exists — verified via owner GET listing the password id), signed-out
visitor gets the prompt, wrong password rejected, right password plays HLS;
embed-privacy PUT → re-GET shows the stored policy → embed page blocks/allows
accordingly.

## W1.U8 — PLAY-09 · Keyboard shortcuts (complete set + help)

Extend `lib/player-shortcuts.ts` (pure, unit-tested) with the mined set, on
top of the existing space/K, J/L, arrows-seek, M, F, C:
- `ArrowUp`/`ArrowDown` volume ±5 % (only while the player region has focus —
  page scroll wins otherwise; seek arrows keep their current global-ish
  behavior),
- `t` theater, `i` PiP, `<`/`>` speed ladder step,
- `0`–`9` decile seek, `Home`/`End`,
- `,`/`.` frame-step (~1/30 s) while paused.
Modified presses stay browser-owned; `SHORTCUT_IGNORE_SELECTOR` still wins.
Update `KeyboardShortcutsHelp` to list every shortcut (it is the user-facing
contract — keep the two in sync, as the file header already demands).
Unit tests for every mapping + clamping; mocked e2e spot-checks (`t`, `>`,
`5` → 50 % seek).

---

## Slice order (backend contracts land before their consumers)

1. **W1.U1** shell (no new backend; the synthetic-manifest quality tests make
   it independent of the ladder investigation)
2. **W1.U2** speed → **W1.U3** theater/PiP → **W1.U8** shortcuts
   (pure frontend, any order after U1)
3. **W1.U4** chapters+storyboards — AFTER core W1.C1 is merged
4. **W1.U5** end card (frontend-only; integrates with U6's setting when it lands)
5. **W1.U6** settings UI — AFTER core W1.C3
6. **W1.U7** passwords/embed — AFTER core W1.C2

## Completeness contract (applies to every slice — PROGRAM §4)

Vertical slice; contract-first against the merged openapi surface; checkbox
flips only with (a) unit tests, (b) mocked Playwright e2e, (c) for
data-mutating flows a backend-backed e2e proving the DB/server state changed
AND the UI shows it after refetch; tasks labeled with feature IDs; design
guardrail (tokens only, templates canonical, axe green, 44 pt targets, W0
screenshot evidence into `.ralph/design-review/w1/<area>/`); `npm run ci`
green locally AND on branch CI, pushed, before the box ticks.
