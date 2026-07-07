# Messaging v2 — Frontend Spec (`vidra-user`)

> Target file: `vidra-user/.ralph/specs/messaging-v2.md`
> Goal: turn the bare-bones `/messages` surface into a proper messenger (iMessage /
> Messenger-grade) while staying 100% inside `design-system.md` (semantic tokens,
> Apple-HIG quiet luxury, light-dark(), WCAG 2.2 AA, mobile bottom-tab shell,
> desktop split-pane). Research base: `RESEARCH.md`; current-state: `AUDIT.md`
> (both in the Messaging v2 package).
>
> Backend contract: everything in this spec consumes the EXISTING `vidra-core`
> contract except items explicitly marked **[needs core: …]**, which map to
> `vidra-core/.ralph/specs/messaging-v2.md`. Build order: everything not marked
> can ship now; marked items ship UI-degraded until the contract lands.

## 0. Scope

IN: inbox (split-pane + mobile), thread view (grouping, separators, avatars, read
state, media), attachments UX (grids, lightbox, progress, retry), composer, polling
refresh, a11y, empty/error/loading states, e2e (mocked + backed with DB-proof).
OUT (documented): typing/presence indicators (INTENTIONAL_DIFFERENCE — polling model,
product-decisions.md §14), pinned conversations, swipe actions, group threads,
delivered ticks (no backend event), E2EE-thread attachments (contract 422 by design).
The `EncryptedThreadView` keeps its current envelope UI; slices below that touch
shared pieces (shell, header, composer visuals) must keep the encrypted branch working.

## 1. Component architecture

```
app/messages/page.tsx                 → <MessagingShell>            (inbox route)
app/messages/[id]/page.tsx            → <MessagingShell threadId>   (thread route)

components/messaging/
  MessagingShell.tsx        split-pane orchestrator (rail + pane; route-aware)
  ConversationRail.tsx      search + New message + <ConversationList>
  ConversationList.tsx      rows (skeleton/empty/error/ready)
  ConversationRow.tsx       avatar/name/snippet/time/unread; active state
  ThreadPane.tsx            header + <MessageTimeline> + <Composer>; not-found/empty
  ThreadHeader.tsx          back chevron, avatar, name/@username, lock, overflow menu
  MessageTimeline.tsx       scroll container, role="log", separators, runs,
                            new-messages divider, scroll-to-bottom pill, polling
  MessageGroup.tsx          one run: bubbles + one avatar gutter
  MessageBubble.tsx         text bubble (run-position radii) + status row slot
  MessageMedia.tsx          image single/grid rendering (bubble-less)
  MessageLightbox.tsx       Modal-based full-size image + Download
  TimeSeparator.tsx         centered day/gap micro-label
  Composer.tsx              auto-grow textarea, attach, send icon-button, chips
  AttachmentChip.tsx        pending upload chip (progress %, retry, remove)
  (keep) AttachmentImage / AttachmentDownloadRow / LinkPreviewCard / MessageAttachments
lib/messaging/
  grouping.ts               pure helpers: buildTimeline(messages) → items
  time.ts                   separator + accessible time formatting
```

`MessagesView.tsx` / `ConversationView.tsx` are refactored into the above; keep the
existing accessible names ("Write a message", "Attach a file", row link names) stable
wherever a behavior is unchanged so the mocked suite diff stays reviewable.

## 2. Layout

- **≥ `lg` (desktop split-pane)**: `MessagingShell` renders a full-height two-pane
  layout inside the existing app shell: rail `w-[360px] shrink-0 border-r
  border-border-subtle`, thread pane `flex-1 min-w-0`. Height:
  `h-[calc(100dvh-<header-h>)]`; the page itself must not scroll — each pane scrolls.
  On `/messages` (no id) the right pane shows the **empty-pane state**: centered
  `EmptyState`-styled block — "Your messages" / "Pick a conversation, or start a new
  one." + New message button.
- **< `lg` (mobile/tablet)**: unchanged routing — `/messages` shows the rail
  full-width; `/messages/[id]` shows only the thread pane with a back chevron. The
  thread pane is `h-[calc(100dvh-<header+tabbar>)]` so the composer sits above the
  bottom tab bar with safe-area padding; no horizontal overflow at 390/768 (gated by
  `e2e/responsive.spec.ts`).
- Navigating rows on desktop updates the URL (`router.push`) without unmounting the
  rail; `aria-current="page"` on the active row.

## 3. Inbox (rail)

Contract: `GET /api/v1/me/conversations?limit=50&offset=0` (`ConversationSummary`).

- **Row anatomy** (48px avatar): `Avatar src={userAvatarUrl(c.other_user_id)}`
  (public route; 404 → initial fallback — do NOT keep `src={null}`)
  **[needs core: `other_has_avatar` to skip the 404 probe — optional, degrade fine]**;
  name `text-[14.5px] font-semibold truncate` + `LockIcon` when `c.encrypted`;
  snippet = `last_message_body` (encrypted → "Encrypted conversation", none → "No
  messages yet"), `truncate text-[13px]`; time = `relativeTime(last_message_at)`
  `text-[11.5px] text-fg-muted` top-right; unread badge as today (`bg-fg text-canvas`
  pill, 99+ cap, aria-label). Unread rows: name AND snippet `font-semibold text-fg`.
- **Active row** (desktop only): `bg-surface-muted rounded-xl`; hover as today.
- **Search field**: pill input (`rounded-full bg-surface-muted`, `aria-label="Search
  conversations"`) above the list; client-side filter on name/username/snippet of the
  loaded page. Empty-filter state: "No conversations match “{q}”."
- **Loading**: 6 skeleton rows (Skeleton primitive: circle + two lines) — replaces the
  centered spinner. **Error**: existing `ErrorState` + retry. **Empty**: existing
  EmptyState copy + New message CTA.
- **Refresh**: poll every 30s while the tab is visible (`document.visibilityState`);
  also refetch on window focus and after a send. Unread badge/snippet update in place;
  list re-sorts by `updated_at` (backend order) — never reorder client-side mid-view
  unless data changed.
- New message flow (`NewMessageButton` modal → `POST /api/v1/conversations`
  `{recipient_username}`) unchanged, restyled into the rail header (icon button,
  `aria-label="New message"`).

## 4. Thread — timeline model

Contract: `GET /api/v1/conversations/{id}/messages?limit=50` (newest-first;
reverse for display), `peer_last_read_message_id`, `POST …/read` on open.

`buildTimeline(messages, peerReadId, meId)` (pure, unit-tested) emits:

```
type TimelineItem =
  | { kind: "separator"; label: string; iso: string }
  | { kind: "new-divider" }                       // first unread on open
  | { kind: "run"; mine: boolean; senderId: string;
      messages: RunMessage[] }                    // 1..n messages
```

- **Separator rule**: emit before message *i* when day(created_at_i) ≠ day(prev) OR
  gap(prev → i) > **60 min**. Labels (24h local): `Today · 14:32`, `Yesterday · 09:15`,
  `Mon · 14:02` (< 7 days), `3 Jul · 14:02` (this year), `3 Jul 2025 · 14:02` (older).
- **Run rule**: same `sender_id` AND gap to previous message ≤ **5 min** AND no
  separator between. A tombstoned message stays in its run.
- **Run-position radii** (base `rounded-[18px]`, inner corner `6px`):
  - own (right): first `rounded-br-[6px]`; middle `rounded-tr-[6px] rounded-br-[6px]`;
    last `rounded-tr-[6px] rounded-br-md`; single = today's shape.
  - other (left): mirror with `l` corners.
- **Spacing**: `gap-0.5` (2px) inside a run; `mt-3` (12px) between runs; `my-5` (20px)
  around separators.
- **Avatar**: other-party runs only — 28px `Avatar src={userAvatarUrl(senderId)}`,
  rendered in a `w-7` gutter, `self-end` (bottom-aligned with the last bubble);
  `aria-hidden` (name is in each message's accessible name). Own runs: no avatar, no
  gutter.
- **Bubble content**: body `whitespace-pre-wrap break-words text-[14.5px]`;
  **remove the in-bubble timestamp**. Each message wraps
  `<time dateTime={iso} title={absolute}>` visually-hidden; the `<li>` accessible name
  is "{sender display name}, {absolute time}: {body | 'Image' | filename}".
- **Media-only messages** (attachments, no body): no bubble fill — `MessageMedia`
  renders the masked media directly (see §6). Mixed body+attachments: bubble with
  media block above text (current order retained).
- **Tombstones**: keep italic `[deleted]` bubble at 70% opacity.
- **Message actions**: replace the always-visible Delete/Report links with a
  hover/focus-revealed overflow: a 28px `IconButton` ("Message actions") appearing on
  `group-hover` / `focus-within` beside the bubble, opening the existing Dropdown with
  Delete (own) / Report (peer) + "Copy text". On coarse pointers the button is always
  visible at reduced opacity (long-press is not reliably accessible). Keep the
  existing delete/report wiring (`DELETE /api/v1/messages/{id}`, `POST
  /api/v1/messages/{id}/report`).

## 5. Read state + sending states

- **Seen**: under the LAST own message only, when `peer_last_read_message_id` is at or
  after it: `Seen` (`text-[11px] text-fg-muted text-right mt-0.5`). No other own
  message shows status. Peer disabled receipts → field omitted → nothing (already the
  contract). No "Delivered" state — do not invent one.
- **Read receipts are ON by default (decided 2026-07-07)**: sending your read state
  and seeing the peer's "Seen" is the default experience. Ship the standard privacy
  toggle in **Settings → Privacy**: a `Toggle` row "Read receipts" (default on) wired
  to `GET/PATCH /api/v1/me/messaging-prefs` (`{read_receipts}`), with the sub-line
  "When off, people can't see when you've read their messages — and you won't see
  when they read yours." (reciprocity is UI policy: when the local pref is off, also
  suppress rendering the peer's Seen row, matching messenger etiquette even though
  the API may still return the peer watermark). Loading/error states per the
  SettingsView conventions; optimistic toggle with rollback on failure.
- **Optimistic send**: on submit, append a local pending message (client id) at 60%
  opacity with `Sending…` micro-label; replace with the server `Message` on 201.
- **Failed send**: bubble stays; label `Not sent · Retry` in `text-danger`
  (`role="alert"`); Retry re-posts the same body/attachment ids; a second control
  removes the draft bubble. Composer stays usable while a send is in flight (drop the
  whole-form `busy` lock; serialize per message).

## 6. Attachments UX

Contract: upload `POST /api/v1/conversations/{id}/attachments`, bytes
`GET /api/v1/attachments/{id}` (auth blob → object URL, as today), 413/415/422/503
error mapping (keep current copy, update the size number).

**Limits (decided 2026-07-07 — Messenger parity, core D6)**: per-file **100 MiB**,
**30 attachments per message**, kinds image/video/audio/pdf **+ `doc`** (office
formats), no storage-quota counting. UI constants (`MAX_ATTACHMENTS`,
`MAX_ATTACHMENT_BYTES`, accept list) update in the slice that consumes the
regenerated client after core D6 lands; until then the current 25 MiB / 4 /
image-video-audio-pdf constants stay. All uploads route through vidra-core's ClamAV
scan hook (fail-closed) — surface a scan rejection as the existing 422 copy.

- **Single image**: `rounded-2xl overflow-hidden`, `max-h-[320px] max-w-full`,
  intrinsic aspect-ratio box **[needs core: `DMAttachment.width/height`]** — until
  then keep the current fixed-skeleton + `object-contain` behavior; after, reserve
  `aspect-ratio: w/h` and `object-cover`. Loading skeleton uses the same box. Error →
  `AttachmentDownloadRow` fallback (existing behavior).
- **2–4 images**: one `rounded-2xl overflow-hidden` mask, `grid grid-cols-2 gap-0.5`;
  3 images → first spans `col-span-2`. Each cell `aspect-square object-cover`.
- **5+ images** (possible once the per-message limit rises to 30): render the first 4
  cells; the 4th cell gets a `bg-black/55` overlay with `+N` (media-overlay exception
  tokens) and opens the lightbox, which pages through the full set
  (Messenger/Telegram album pattern).
- **Lightbox**: clicking an image opens `MessageLightbox` (existing `Modal` a11y
  contract): image at natural size (`max-h-[85dvh]`), filename + size caption,
  Download button (existing blob-download path), Escape/scrim close.
- **video/audio/pdf**: keep `AttachmentDownloadRow` cards (icon, name, size,
  Download). Optional later: inline `<audio controls>` via object URL.
- **Composer chips** (`AttachmentChip`): filename + size + state. Uploading shows
  percent **(requires XHR/`fetch` with progress — implement `uploadDMAttachment`
  progress callback via XMLHttpRequest; no contract change)**; indeterminate fallback
  is the current "Uploading…". Error chip: message + **Retry** (re-upload same File —
  keep the `File` in local state) + Remove. Ready chip: name + size + Remove.
  Images additionally render a 40px thumbnail preview from the local `File`
  (`URL.createObjectURL`, revoked on unmount).
- Attach button: unchanged placement/labels; disabled at the per-message cap
  (4 today, 30 after core D6); file-picker accept list extends with the office-doc
  MIME types when D6 lands; `doc` attachments render via `AttachmentDownloadRow`
  (add a doc glyph to `KIND_ICON`).

## 7. Composer

- Textarea `rows=1`, auto-grow to 6 lines then internal scroll (prefer CSS
  `field-sizing: content` with `max-height`; JS scrollHeight fallback). Keep
  `aria-label="Write a message"`, `maxLength=5000`, placeholder, `rounded-[22px]
  bg-surface-muted`.
- **Keyboard (decided 2026-07-07)**: on desktop (`matchMedia("(pointer: fine)")`)
  **Enter sends, Shift+Enter inserts a newline**; on mobile/coarse pointers Enter is
  always a newline and the **send button is the only send affordance**.
  `aria-keyshortcuts="Enter"` on the send button when active. IME composition
  (`e.isComposing`) never sends.
- **Send control**: 44px circular `IconButton` (`bg-accent text-accent-fg`,
  arrow-up glyph, `aria-label="Send message"`), disabled until trimmed body ≠ "" or a
  ready attachment exists AND no upload is in flight (current `canSend` logic).
- Char counter `n / 5000` (`text-[11px] text-fg-muted`, `aria-live="polite"`) only
  once length > 4500.
- Draft preservation: body + chips survive a failed send (already true — keep) and
  navigation between conversations within the session (per-conversation draft map in
  the shell).

## 8. Thread chrome

- **ThreadHeader** (sticky top of pane, `bg-canvas/80 backdrop-blur`, hairline bottom
  border): back chevron `< lg` (`aria-label="Back to messages"`, 44px target) → 32px
  avatar → name `font-semibold` + `@username` `text-[12px] text-fg-muted` second line
  → `LockIcon` + "Encrypted" pill on encrypted threads → overflow `Dropdown`
  ("Conversation options"): Report conversation partner (existing ReportButton wiring),
  Block (existing block endpoint via profile), "View profile" link.
  The other participant's identity comes from the messages page today; when the
  thread has no messages yet, fall back to the inbox summary (pass through the shell)
  — **[needs core (optional): `GET /conversations/{id}` returning the peer summary]**.
- **Scroll behavior** (`MessageTimeline`):
  - The timeline is the ONLY scroll container; on open, render pinned to bottom
    (no animation; set `scrollTop` before paint).
  - Auto-stick: when a new message arrives and the user is within 120px of the
    bottom, stick to bottom (`behavior:"auto"` — reduced-motion safe); otherwise keep
    the scroll position (anchor by first visible message id).
  - **Scroll-to-bottom pill**: appears when > 300px from bottom —
    `rounded-full bg-surface-raised border-border-subtle shadow-lg` with ↓ glyph;
    when unseen messages arrived while scrolled up it shows `N new` and
    `aria-label="Jump to latest, N new messages"`.
  - **New-messages divider**: on open, if `unread_count > 0`, insert
    `{ kind: "new-divider" }` before the first unread (first peer message after my
    watermark): hairline + centered `NEW` micro-label in `text-fg-muted`; drop it on
    the next open.
  - **History**: "Load earlier" — when scrolled to top and more pages exist
    (page full ⇒ maybe more), fetch the next page and prepend, preserving scroll
    anchor. Use offset paging now; switch to `before_id` when available
    **[needs core: `before_id` cursor for correctness under concurrent sends]**.
- **Polling**: while the thread is visible, refetch page 1 every **10s** (abortable,
  skipped when a send is in flight or tab hidden); merge by id (server wins), advance
  the read watermark (`POST …/read`) only when the timeline is at bottom AND the tab
  is focused — never mark read in the background.
- **Offline/poll-failure banner**: after 2 consecutive poll failures show a slim
  banner under the header — "Connection lost — retrying…" (`bg-warning/15
  text-warning`, `role="status"`); clears on success. (Adapted from the bk repo's
  reconnect banner.)

## 9. Accessibility (hard requirements)

- Timeline container: `role="log"` + `aria-label="Conversation with {name}"`
  (implicit polite live region — appended messages are announced without moving
  focus). Do NOT add `aria-live="assertive"` anywhere in the thread.
- Each message `<li>`: accessible name "{sender}, {absolute time}: {content}" via
  visually-hidden prefix; attachments announce as "Image: {filename}" / "{kind}:
  {filename}, {size}".
- Separators and the NEW divider are real text (not aria-hidden).
- Focus: composer keeps focus after send; opening a thread moves focus to the
  composer on desktop, to the header back button on mobile only when arriving via the
  rail (never steal on poll updates). Lightbox = Modal focus trap/restore contract.
- All icon-only controls: explicit `aria-label`s (send, attach, actions, jump pill,
  back). `.focus-ring` on every interactive element. Touch targets ≥ 44px (28px
  visual glyphs get padded hit areas).
- Reduced motion: programmatic scrolling always `behavior:"auto"`; no entrance
  animations. axe (serious/critical) stays green on `/messages` and `/messages/[id]`
  in both themes.

## 10. States checklist (every slice ships all of these)

| Surface | Loading | Empty | Error | Permission |
|---|---|---|---|---|
| Rail | 6 skeleton rows | "No messages yet" + CTA | ErrorState + retry | signed-out EmptyState (existing) |
| Thread | bubble-shaped skeletons (3 runs) | "No messages yet. Say hello." | not-found (404) vs generic + retry (existing copy) | signed-out EmptyState |
| Media | ratio skeleton | — | download-row fallback | 401 → row fallback |
| Composer | — | — | inline `role="alert"` under field | disabled when signed out |
| Send | pending bubble | — | Not sent · Retry | 403 block copy (existing) |

## 11. Design guardrails (restated, binding)

Tokens only — no raw hex/zinc/`dark:`; bubbles use `accent`/`surface-muted`; status
colors only for status (danger = failed send, warning = offline banner). Radii per
design-system table (bubbles are the documented 18px exception pattern; media
`rounded-2xl`; pills `rounded-full`). Type scale per design-system (body 14.5px,
micro-labels 10.5–11px). Motion: `transition-colors` only. Before/after screenshots
(light+dark × 390px+1280px) into `.ralph/design-review/w0/messaging/` for every visual
slice, per the W0 working rules.

## 12. Test requirements

**Unit (vitest)**: `lib/messaging/grouping.test.ts` — run boundaries (sender change,
5-min gap, separator split), separator labels across day/year boundaries, new-divider
placement, timeline stability with tombstones; `time.test.ts` label matrix (mock
clock). Composer keyboard matrix (Enter/Shift+Enter/IME/coarse pointer).

**Mocked Playwright (`e2e/messaging.spec.ts` — extend, keep existing 17 green or
update selectors in-slice)**:
- runs render grouped (one avatar per other-run, bottom-aligned; no avatar own-side)
- separators appear exactly on >60min / day-boundary fixtures; no in-bubble times
- Seen appears only under last own read message; pending + failed→Retry flows
  (route-mock 500 then success)
- image grid 2/3/4 fixtures + 5+ fixture shows the `+N` overlay; lightbox
  opens/closes with focus restore
- Settings → Privacy read-receipts toggle: renders default-on, PATCHes
  `/me/messaging-prefs` on change, rolls back on mocked failure
- split-pane at 1280px (rail + empty pane; row click swaps thread, URL updates);
  390px stacked flow with back chevron
- scroll-to-bottom pill + NEW divider (fixture with unread_count > 0)
- composer: Enter sends (fine pointer project), Shift+Enter newline, counter at 4501
- axe scan of both routes in light + dark.

**Backed Playwright (`e2e-backed/messaging.spec.ts` — extend; DB-proof per the
Critical Verification Rule)**:
- send → poll (10s) delivers to the second signed-in context WITHOUT reload; assert
  via the recipient page AND `GET /conversations/{id}/messages` API read as DB proof
- attachment round trip stays green (existing) + multi-image send renders a grid for
  the recipient
- read receipt: recipient opens → sender's poll shows Seen (existing spec extended to
  no-reload)
- failed-send retry: kill route to backend once (context.route abort), retry
  persists — verify by API read-back
- messaging-prefs toggle off → Seen disappears for the peer (settings + thread).

## 13. Slice map (matches fix_plan tasks)

1. **S1 Timeline model** — grouping/separators/no-bubble-times + unit tests (pure lib
   + MessageTimeline render path; no layout change).
2. **S2 Avatars & identity** — inbox real avatars, thread run avatars, ThreadHeader.
3. **S3 Scroll architecture** — pane scrolling, pill, NEW divider, load-earlier,
   polling + offline banner.
4. **S4 Sending states** — optimistic/pending/failed-retry, per-message overflow
   actions, Seen placement, Settings → Privacy "Read receipts" toggle (default on,
   messaging-prefs wiring).
5. **S5 Composer v2** — auto-grow, Enter-to-send (desktop) / button-only (mobile),
   icon send, counter, drafts.
6. **S6 Media v2** — grids (incl. 5+ "+N" overlay), lightbox, upload progress/retry
   chips (intrinsic ratio once core ships width/height; Messenger-parity limits +
   `doc` kind once core D6 ships).
7. **S7 Desktop split-pane** — MessagingShell, rail search, empty pane, aria-current.
8. **S8 Polish + axe/W0 evidence** — screenshots, i18n strings via `t()` where shared,
   ledger updates.

Dependency: S1→S3→S4 sequential; S2, S5 parallel after S1; S6 after S4; S7 after S2;
S8 last. Core deltas (width/height, before_id, has_avatar) land independently and are
consumed opportunistically — every consuming slice must degrade gracefully without
them.
