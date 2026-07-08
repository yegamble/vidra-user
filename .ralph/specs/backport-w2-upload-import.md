# Backport W2 — Upload & import pipeline (vidra-user half)

Destination when wired: `vidra-user/.ralph/specs/backport-w2-upload-import.md`
Programme: `.ralph/specs/backport/PROGRAM.md` §3 W2 row.
Feature IDs (FEATURE_VISION.md numbering): UPLOAD-02/03 UI, UPLOAD-04 frame-pick,
UPLOAD-07 UI (verify-only), UPLOAD-09 UI, UPLOAD-10 UI, UPLOAD-13 UI.

## 0. Verified current state (2026-07-08 — re-verify at execution time)

The design-refresh wave (commit `69aeae5`, DR9 studio) is the UI baseline. Build on
its vocabulary — never from scratch:
- `components/StudioView.tsx` — creator surface: dashed **dropzone** (transparent
  overlay input, peer-focus ring), **byte-detail progress line**, video rows with
  design poster thumb + processing spinner overlay + **status pills**, storage card
  bound to `GET /me/quota`, token recipes for hand-written form fields.
- Resumable upload already wired: `lib/api/upload.ts` (`uploadWithProgress`),
  `resumableUpload` with chunk-accurate progress; a localStorage
  `StoredUploadSession` matched by filename+size offers "Resume upload" after a
  refresh; cancellation via the `upload_cancelled` ApiError convention.
- URL import (direct file) already wired: `importVideoFile` / `getVideoImport` in
  `lib/api/endpoints.ts`, polling with honest failure states ("a dead upload must
  never be reported as published").
- Schedule already SHIPPED end-to-end: `publish_at` picker + field errors +
  honest scheduled outcome in StudioView, `e2e/studio-schedule.spec.ts`.
- Custom thumbnail upload already wired (`ThumbnailManager`).

House rules: design tokens only (no `dark:`/raw palette), no emoji, templates in
`.ralph/specs/design/` canonical, `npm run codegen` (byte-for-byte contract-checked)
after any vidra-core contract change, `npm run ci` green (typecheck, lint,
lint:icons, unit, build, e2e incl. axe) before a box ticks.

## 1. Slices (vertical; BLOCKED-on-backend markers as in W1)

### W2.U0 — Opening slice: spec-in-repo + UPLOAD-07 close-out
- Copy this spec to `vidra-user/.ralph/specs/backport-w2-upload-import.md`; add the
  W2.U section to `vidra-user/.ralph/fix_plan.md` with BLOCKED-on-backend markers
  (grep `vidra-core/api/openapi.yaml` fresh at execution time, W1-style).
- UPLOAD-07 UI: verify shipped (schedule picker, scheduled outcome message,
  `e2e/studio-schedule.spec.ts` green); add a `Scheduled` status pill to the studio
  video rows if absent (rows already show pills; scheduled videos must not read as
  published). Record CLOSED.

### W2.U1 — Draft recovery v2 (UPLOAD-02/03 UI) — BLOCKED on core W2.C2
- Compute the documented `file_fingerprint` client-side (SHA-256 over size +
  first/last 1 MiB via WebCrypto) and send it on session create.
- On studio load, `GET /me/uploads`: render a "Resume upload" recovery card
  (surface-muted, same vocabulary as the storage card) listing active sessions —
  filename, received/total bytes as a 5px bar, expiry countdown, Resume + Discard
  (DELETE) actions. Re-picking the same file matches by fingerprint (server truth;
  localStorage demoted to a cache).
- Resume requires re-picking the file (browsers cannot re-read a file handle after
  reload); the card says so plainly. Discard cancels the session server-side.
- Tests: unit for fingerprint + matching; `e2e/upload-draft-recovery.spec.ts` —
  start upload, reload, recovery card appears, resume completes; backend-backed
  e2e proving the session row survives reload and the completed video appears
  after refetch.

### W2.U2 — Import-from-URL flow with job status (UPLOAD-09 UI) — BLOCKED on core W2.C1
- Extend the existing import path in StudioView into a first-class two-tab source
  choice on the upload section: "Upload file" (dropzone, unchanged) / "Import from
  URL" (URL field + paste-detect). Platform URLs (non-direct-file) surface the new
  `resolver: "auto"` request; UI never guesses the resolver.
- Job status rail driven by the extended `import_job` view (`stage`):
  queued → fetching metadata → downloading → scanning & processing — reuse the
  processing spinner overlay + status pill vocabulary; SAFE `error` shown verbatim
  on failure with a Retry affordance (re-enqueue via the same endpoint).
- Metadata prefill: after the resolving stage, refetch the draft video and show
  the yt-dlp-resolved title/description/poster in the form (user edits win).
- Disabled state: when the backend returns the stable 503 code (feature off), the
  URL tab renders an honest "imports are disabled on this instance" empty state —
  never a dead form.
- Tests: unit for stage mapping + disabled state; `e2e/video-import-url.spec.ts`
  (mock-backed, all stages + failure); backend-backed e2e using a DIRECT file URL
  against the compose stack (yt-dlp not required in CI) proving the import_jobs
  row transitions and the video appears published after refetch.

### W2.U3 — Thumbnail frame-pick (UPLOAD-04 UI) — BLOCKED on core W2.C5
- In ThumbnailManager (studio row editor): "Pick from video" opens a scrubber —
  seek preview using the W1 storyboard assets (`storyboard.jpg` + `.vtt`) when
  present, else a muted `<video>` element; "Use this frame" POSTs
  `{at_seconds}`; poster refetches into the row thumb.
- Keep the existing custom-image upload as the sibling action; both live in the
  same card, token recipes only.
- Tests: unit for scrub state/bounds; `e2e/upload-thumbnail.spec.ts` — pick a
  frame, poster updates after refetch (backend-backed variant on the compose
  stack).

### W2.U4 — Batch upload (UPLOAD-10 UI) — depends on core W2.C3 (limit code), else unblocked
- Multi-file dropzone (`multiple` on the existing transparent overlay input): each
  dropped file becomes a queued row in the upload section — per-file title
  (prefilled from filename), independent byte-detail progress line, status pill,
  cancel and retry per row.
- Bounded parallelism: at most 2 concurrent resumable sessions client-side; the
  rest queue. On the server's active-session-limit error code, the row waits in
  `Queued` rather than failing.
- Quota preflight: sum of pending sizes checked against the storage card's
  `QuotaStatus`; over-quota rows are marked before any bytes move.
- Tests: unit for the queue reducer (parallelism, retry, limit backoff);
  `e2e/upload-batch.spec.ts` — drop 3 files, all reach done; backend-backed e2e
  proving 3 video rows exist after refetch.

### W2.U5 — Channel auto-sync management (UPLOAD-13 UI) — BLOCKED on core W2.C4
- Studio section "Auto-import from another platform" (below the channel cards):
  connect form (target channel select + external channel URL), list of syncs with
  state pill (`Waiting first run | Syncing | Idle | Failed`), `last_sync_at`,
  safe last_error, Sync now + Remove actions.
- Feature-off 503 renders the honest disabled empty state (same pattern as W2.U2).
- Tests: unit for state pills + form validation; `e2e/channel-sync.spec.ts`
  (mock-backed CRUD + trigger); backend-backed e2e for create/delete row proof
  (worker execution NOT required in e2e — trigger returns 202 and the list
  refetch shows `syncing`/`waiting_first_run`).

## 2. Suggested execution order
W2.U0 → W2.U4 → W2.U1 → W2.U3 → W2.U2 → W2.U5
(U4 needs no new backend contract beyond an error code; U1/U3 unblock on the small
core slices; U2/U5 follow the yt-dlp long pole.)

## 3. Explicit non-goals
- Re-building the dropzone/progress/pills vocabulary (DR9 shipped it).
- Schedule UI (shipped — verify only), custom thumbnail upload (shipped),
  PeerTube admin import wizard (shipped, separate).
- Torrent/magnet input field — deferred with the core recommendation; the URL tab
  accepts http(s) URLs only.

## 4. Completeness contract (PROGRAM.md §4 — binds every W2.U task)
Vertical slices only; never merge UI against a non-existent endpoint (BLOCKED
markers + fresh openapi.yaml grep at execution time); a checkbox flips only with
(a) unit tests, (b) a Playwright e2e, (c) for data-mutating flows a backend-backed
e2e proving the DB row changed AND the UI shows it after refetch; 1:1 feature-ID
traceability; design guardrail (tokens only, templates canonical, before/after
screenshots light+dark × mobile+desktop for changed screens); `npm run ci` green
locally and on branch CI.
