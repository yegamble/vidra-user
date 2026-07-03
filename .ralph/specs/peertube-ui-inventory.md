# PeerTube UI Inventory

This file tracks PeerTube-visible UI down to controls/buttons and maps it to Vidra implementation and tests.

Status values: `NOT_STARTED`, `SURVEYED`, `IMPLEMENTED`, `VERIFIED`, `INTENTIONAL_DIFFERENCE`, `DEFERRED`, `BLOCKED`.

## Inventory template

For every route/flow, use this structure:

```md
## PT-AREA-ROUTE-NAME — Human readable page name

- Reference route/page: TBD
- Vidra route/component: TBD
- Auth states: logged-out / logged-in / owner / moderator / admin / remote / blocked / banned / permission denied
- Responsive states: mobile / tablet / desktop
- Backend dependencies: TBD
- Playwright spec: TBD
- Status: NOT_STARTED

### Controls

| control id | label / accessible name | type | states | behavior | backend dependency | tests | status | evidence |
|---|---|---|---|---|---|---|---|---|
| PT-AREA-CONTROL | TBD | button/menu/tab/input/modal | default/hover/focus/disabled/loading/error | TBD | TBD | TBD | NOT_STARTED | none |
```

## Seed areas Ralph must expand

### PT-NAV — Shell/navigation

| control id | label / accessible name | type | states | behavior | backend dependency | tests | status | evidence |
|---|---|---|---|---|---|---|---|---|
| PT-NAV-PUBLISH | Publish | nav button/link | logged-in/disabled if no upload rights | Opens publish flow | auth, quota, instance upload config | Playwright nav | NOT_STARTED | none |
| PT-NAV-SEARCH | Search | input/button | empty/focused/results/error | Search local/global/URI/handle | search API | Playwright search | NOT_STARTED | none |
| PT-NAV-MY-LIBRARY | My library | nav link | logged-in only | Opens library/history/playlists | auth | Playwright auth nav | NOT_STARTED | none |
| PT-NAV-HISTORY | History | nav link | always shown (content auth-gated) | Opens /history watch-history page | GET /me/history | e2e/history.spec.ts + e2e-backed/history.spec.ts | VERIFIED | components/Header.tsx; app/history/page.tsx; components/WatchHistoryView.tsx |
| PT-NAV-NOTIFICATIONS | Notifications | bell icon link + unread badge | authed only; badge when unread>0 | Opens /notifications; badge = unread count | GET /me/notifications/unread-count | e2e/notifications.spec.ts + e2e-backed/notifications.spec.ts | VERIFIED | components/NotificationsBell.tsx; app/notifications/page.tsx; components/NotificationsView.tsx |
| PT-NAV-NOTIF-MARK-READ | Mark read / Mark all as read | buttons | unread/read | Marks one or all notifications read | POST /me/notifications/:id/read, /read-all | e2e/notifications.spec.ts + e2e-backed/notifications.spec.ts | VERIFIED | components/NotificationsView.tsx |
| PT-NAV-PLAYLISTS | Playlists | nav link | always shown (content auth-gated) | Opens /playlists list + create; /playlists/:id detail | GET /me/playlists, POST/GET/DELETE /playlists | e2e/playlists.spec.ts + e2e-backed/playlists.spec.ts | VERIFIED | components/Header.tsx; app/playlists/page.tsx; components/PlaylistsView.tsx; app/playlists/[id]/page.tsx; components/PlaylistDetailView.tsx |
| PT-NAV-STUDIO | Studio | nav link | always shown (content auth-gated) | Opens /studio: create channel + upload/publish a video | GET /me/channels, POST /channels, POST /channels/:handle/videos, POST /videos/:id/file | e2e/studio.spec.ts + e2e-backed/studio.spec.ts | VERIFIED | components/Header.tsx; app/studio/page.tsx; components/StudioView.tsx |
| PT-NAV-MY-VIDEO-SPACE | My video space | nav group | creator/admin | Shows videos/channels/studio | auth/permissions | Playwright | NOT_STARTED | none |
| PT-NAV-ADMINISTRATION | Administration | nav group | admin/mod only | Opens admin sections | RBAC | Playwright RBAC | NOT_STARTED | none |
| PT-NAV-MOBILE-MENU | Menu (hamburger) | disclosure button + menu | closed/open (`aria-expanded`), `<sm` only | Collapses all primary nav links + role-gated Moderation/Admin + auth controls; focus moves in on open, Escape/outside-click/link-follow close (focus restored to toggle) | none (links auth-gated downstream) | e2e/mobile-nav.spec.ts (390×844, 4 tests) | IMPLEMENTED | components/Header.tsx |
| PT-SHELL-LANDMARKS | banner / Primary nav / search / main | landmarks | always | Exactly one `<header>`/`<main>` per page; nav labeled "Primary"; search landmark in header | none | e2e/a11y-landmarks.spec.ts | IMPLEMENTED | components/Header.tsx; app/*/page.tsx |
| PT-SHELL-404 | Page not found / Go home | error page + link | unknown route | Catch-all 404 with site chrome and a home link (HTTP 404) | none | e2e/not-found.spec.ts | IMPLEMENTED | app/not-found.tsx |
| PT-SHELL-ERROR-BOUNDARY | Something went wrong / Try again | route error boundary | render/runtime error below root layout | `role="alert"` + reset re-render; per-view inline errors remain primary | none | manual (hard to trigger under mocks) | IMPLEMENTED | app/error.tsx; app/loading.tsx |

### PT-WATCH — Watch page/player

| control id | label / accessible name | type | states | behavior | backend dependency | tests | status | evidence |
|---|---|---|---|---|---|---|---|---|
| PT-WATCH-PLAY-PAUSE | Play/Pause | player button | playing/paused/loading/error | Toggle playback | HLS/file URLs | Playwright player | NOT_STARTED | none |
| PT-WATCH-VOLUME | Volume/Mute | player control | muted/unmuted/focused | Adjust/mute audio | none | Playwright/a11y | NOT_STARTED | none |
| PT-WATCH-FULLSCREEN | Fullscreen | player button | supported/unsupported | Enter/exit fullscreen | none | Playwright | NOT_STARTED | none |
| PT-WATCH-QUALITY | Quality | player menu | multiple/single/disabled | Select video rendition | video files/renditions API | Playwright | NOT_STARTED | none |
| PT-WATCH-SPEED | Speed | player menu | default/selected | Select playback speed | none | Playwright | NOT_STARTED | none |
| PT-WATCH-CAPTIONS | Captions/Subtitles | player menu | captions/no captions | Select captions | captions API | Playwright | NOT_STARTED | none |
| PT-WATCH-LIKE | Like | action button | logged-out/logged-in/liked | Like/unlike | ratings API | integration/Playwright | NOT_STARTED | none |
| PT-WATCH-DISLIKE | Dislike | action button | logged-out/logged-in/disliked | Dislike/undo | ratings API | integration/Playwright | NOT_STARTED | none |
| PT-WATCH-SAVE | Save to playlist / Watch later | menu/button | logged-out/logged-in/saved | Opens playlist save menu (+ ★ watch-later) | playlist API + saved API | e2e/playlists.spec.ts + e2e-backed/playlists.spec.ts (+ save.spec.ts) | VERIFIED | components/AddToPlaylistButton.tsx; components/SaveButton.tsx |
| PT-WATCH-SHARE | Share | button/modal | default/open/copied | Opens share/embed/download options | video URL/embed | Playwright | NOT_STARTED | none |
| PT-WATCH-DOWNLOAD | Download | button/modal | allowed/forbidden | Select downloadable resolution | files/download API | Playwright | NOT_STARTED | none |
| PT-WATCH-REPORT | Report | button/modal | logged-out (sign-in link) / logged-in (reason dialog → submit/success) | Files an abuse report against the video | POST /videos/:id/report | e2e/report.spec.ts + e2e-backed/report.spec.ts | VERIFIED | components/ReportButton.tsx; components/WatchView.tsx |
| PT-WATCH-SUPPORT | Support | button/link | present/absent | Shows creator support text/link | video support metadata | Playwright | NOT_STARTED | none |
| PT-WATCH-RESUME | Resume from m:ss | button | shown when saved position ≥5s / hidden | Seeks player to the saved resume position | GET /videos/:id/watch-progress | e2e/history.spec.ts | VERIFIED | components/WatchView.tsx (Player) |
| PT-WATCH-HISTORY-RECORD | (implicit progress reporting) | player behaviour | authed only; throttled/pause/unmount | Records playback position so the video enters history & can be resumed | PUT /videos/:id/watch-progress | e2e-backed/history.spec.ts | VERIFIED | components/WatchView.tsx (Player) |
| PT-WATCH-COMMENT-SUBMIT | Comment | composer button | disabled/loading/error | Adds comment | comments API/federation | integration/Playwright | NOT_STARTED | none |
| PT-WATCH-COMMENT-REPORT | Report (comment) | link/modal | shown for authed non-authors | Files an abuse report against a comment | POST /comments/:id/report | e2e/report.spec.ts + e2e-backed/report.spec.ts | VERIFIED | components/ReportButton.tsx; components/CommentsSection.tsx |

### PT-PUBLISH — Publish/upload/live

| control id | label / accessible name | type | states | behavior | backend dependency | tests | status | evidence |
|---|---|---|---|---|---|---|---|---|
| PT-PUBLISH-TAB-FILE | Upload file | tab | selected/unselected | Shows file upload form | upload enabled | Playwright | NOT_STARTED | none |
| PT-PUBLISH-FILE-SELECT | Select file to upload | button/input | empty/uploading/error | Starts upload | upload API/storage/scan | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-PUBLISH-TAB-URL | Import with URL | tab | enabled/disabled | Shows URL importer | import config/SSRF | fuzz/integration/Playwright | NOT_STARTED | none |
| PT-PUBLISH-URL-IMPORT | Import | button | disabled/loading/error | Starts remote URL import | importer job | integration/Playwright | NOT_STARTED | none |
| PT-PUBLISH-TAB-TORRENT | Import with torrent | tab | enabled/disabled | Shows torrent/magnet importer | torrent importer | integration/Playwright | NOT_STARTED | none |
| PT-PUBLISH-GO-LIVE | Go live | tab/button | enabled/disabled | Creates live stream | RTMP/HLS config | smoke/Playwright | NOT_STARTED | none |
| PT-PUBLISH-PRIVACY | Privacy | select/radio | public/unlisted/private/internal | Sets visibility | permissions/federation | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-PUBLISH-CHANNEL | Channel | select | empty/multiple | Selects owning channel | channel API | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-PUBLISH-SAVE | Save/Publish | button | disabled/loading/success/error | Saves metadata/publishes | videos API/jobs | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |

### PT-STUDIO — Studio video management ("Your videos")

| control id | label / accessible name | type | states | behavior | backend dependency | tests | status | evidence |
|---|---|---|---|---|---|---|---|---|
| PT-STUDIO-MY-VIDEOS-LIST | Your videos | list | loading/error/empty/ready | Lists the owner's videos for the selected channel (drafts/private included) with state + privacy | GET /channels/:handle/videos (owner view) | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-STUDIO-MY-VIDEOS-CHANNEL | Videos channel | select | single/multiple channels | Chooses which channel's videos to manage | GET /channels/:handle/videos | Playwright | VERIFIED | e2e/studio.spec.ts; components/StudioView.tsx |
| PT-STUDIO-MY-VIDEOS-REFRESH | Refresh | button | idle/loading | Refetches the video list (e.g. after a new upload) | GET /channels/:handle/videos | Playwright | VERIFIED | e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-STUDIO-VIDEO-EDIT | Edit | row action → inline form | view/edit; title+privacy; 422/error | Updates a video's title & privacy | PATCH /videos/:id (owner) | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-STUDIO-VIDEO-DELETE | Delete | destructive row action | confirm/cancel/loading | Deletes a video (two-step confirm) | DELETE /videos/:id (owner) | integration/Playwright | VERIFIED | e2e/studio.spec.ts + e2e-backed/studio.spec.ts; components/StudioView.tsx |
| PT-STUDIO-VIDEO-STATE | Status badge | badge | draft/processing/published/failed | Shows lifecycle state | videos API | Playwright | VERIFIED | e2e/studio.spec.ts; components/StudioView.tsx |
| PT-STUDIO-CHANNEL-LIST | Your channels | list + create form | empty/populated | Lists owned channels (name → /channels/:handle) and creates one (handle + display name; 409 → taken) | GET /me/channels, POST /channels | e2e/studio.spec.ts + e2e-backed/studio.spec.ts | VERIFIED | components/StudioView.tsx |
| PT-STUDIO-CHANNEL-EDIT | Edit (channel) | row action → inline form | view/edit; display name + description; error | Updates a channel's display name & description (handle immutable) | PATCH /channels/:handle (owner) | e2e/studio.spec.ts + e2e-backed/channel-management.spec.ts | VERIFIED | components/StudioView.tsx |
| PT-STUDIO-CHANNEL-DELETE | Delete (channel) | destructive row action | confirm/cancel/loading | Deletes a channel + its videos (two-step confirm; cascades) | DELETE /channels/:handle (owner) | e2e/studio.spec.ts + e2e-backed/channel-management.spec.ts | VERIFIED | components/StudioView.tsx |

### PT-ADMIN — Administration/moderation

| control id | label / accessible name | type | states | behavior | backend dependency | tests | status | evidence |
|---|---|---|---|---|---|---|---|---|
| PT-ADMIN-USERS-LIST | Users (nav + list/search) | route/list | admin only (anon/regular/mod → "Administrators only" gate; admin-only nav link); search by q; loading/error/empty | Lists accounts (username, email, role, active/verified badges, joined) with a username/email substring search | GET /admin/users | e2e/admin-users.spec.ts + e2e-backed/admin-users.spec.ts | VERIFIED | app/admin/users/page.tsx; components/AdminUsersView.tsx; components/AdminNavLink.tsx |
| PT-ADMIN-USERS-EDIT | Edit role / active | row controls | role select + Deactivate/Reactivate; self-row disabled ("you"); saving/error | Changes a user's role and active flag inline | PATCH /admin/users/:id | e2e/admin-users.spec.ts + e2e-backed/admin-users.spec.ts | VERIFIED | components/AdminUsersView.tsx |
| PT-ADMIN-USERS-CREATE | Create user | button/modal | admin only | Creates local user | users API/RBAC | integration/Playwright | NOT_STARTED | none |
| PT-ADMIN-USERS-BAN | Ban (deactivate) | row toggle | confirm via toggle; self disabled | Deactivates/reactivates an account (revokes sessions) | PATCH /admin/users/:id is_active | e2e-backed/admin-users.spec.ts | VERIFIED | components/AdminUsersView.tsx |
| PT-ADMIN-MOD-QUEUE | Moderation (nav + queue) | route/list | mod/admin only (anon/regular → "Moderators only" gate; role-gated nav link); Open/All filter; loading/error/empty | Lists abuse reports (reporter, target link/quote, reason, status badge, relative time) | GET /admin/reports | e2e/moderation.spec.ts + e2e-backed/moderation.spec.ts | VERIFIED | app/moderation/page.tsx; components/ModerationQueue.tsx; components/ModerationNavLink.tsx |
| PT-ADMIN-REPORT-ACCEPT | Accept report | action | loading/optimistic-remove/error | Accepts an open report with an optional internal note; row leaves the open queue | POST /admin/reports/:id/resolve | e2e/moderation.spec.ts + e2e-backed/moderation.spec.ts | VERIFIED | components/ModerationQueue.tsx |
| PT-ADMIN-REPORT-REJECT | Reject report | action | loading/optimistic-remove/error | Rejects an open report with an optional internal note | POST /admin/reports/:id/resolve | e2e/moderation.spec.ts + e2e-backed/moderation.spec.ts | VERIFIED | components/ModerationQueue.tsx |
| PT-ADMIN-REPORT-NOTE | Internal note | textarea | optional, ≤2000 | Internal moderator note attached on resolve (not shown to reporter) | POST /admin/reports/:id/resolve | e2e-backed/moderation.spec.ts | VERIFIED | components/ModerationQueue.tsx |
| PT-ADMIN-REG-QUEUE | Registration (nav + queue) | route/list | admin only (anon/regular → "Administrators only" gate); Pending/All filter; loading/error/empty | Lists registration requests (username, email, applicant note, status badge, requested time; reviewer + internal note when resolved) | GET /admin/registration-requests | e2e/registration-approval.spec.ts + e2e-backed/registration-approval.spec.ts (env-gated) | FRONTEND_PARTIAL | app/admin/registration-requests/page.tsx; components/AdminRegistrationRequestsView.tsx |
| PT-ADMIN-REG-APPROVE | Approve {username} | action | submitting/disabled; inline 409 ("has since been taken", role=alert); row flips in place | Approves a pending signup, creating the account atomically | POST /admin/registration-requests/:id/approve | e2e/registration-approval.spec.ts (+ backed, env-gated) | FRONTEND_PARTIAL | components/AdminRegistrationRequestsView.tsx |
| PT-ADMIN-REG-REJECT | Reject {username} (+ internal note) | action/textarea | optional note ≤2000; submitting; row flips in place with note shown | Rejects a pending signup with an optional internal moderator note | POST /admin/registration-requests/:id/reject | e2e/registration-approval.spec.ts (+ backed, env-gated) | FRONTEND_PARTIAL | components/AdminRegistrationRequestsView.tsx |
| PT-AUTH-SIGNUP-PENDING | Awaiting-approval signup | form state | approval-required copy under the form; optional "Message to the administrators" note; 202 → confirmation, no session | On an approval-required instance, signup files a pending request and shows "Your account is awaiting approval" instead of signing in | POST /auth/register (202 {status:pending}); GET /instance registration_requires_approval | e2e/registration-approval.spec.ts (+ backed, env-gated) | FRONTEND_PARTIAL | components/auth/SignupForm.tsx; components/auth/AuthProvider.tsx |
| PT-ADMIN-VIDEO-BLOCK | Block video | action | local/remote | Blocks local/remote video | block API/federation | integration/Playwright | NOT_STARTED | none |
| PT-ADMIN-WATCHED-WORDS-SAVE | Save watched words list | button | validation/loading/error | Saves moderation watched words | watched words API | integration/Playwright | NOT_STARTED | none |

## Rule

Ralph must expand this inventory whenever it discovers a new page, action, menu item, admin workflow, player control, or responsive variant. Do not mark a route complete until every visible control has a status and evidence.
