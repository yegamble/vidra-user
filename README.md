# Vidra User

The TypeScript **Next.js** frontend for **Vidra** — a clean-room, PeerTube-inspired
federated video platform. This project (`vidra-user`) consumes the HTTP API served by
the sibling **`vidra-core`** Go backend.

> Status: scaffolded (P1 foundation). Next 16 (app router) · React 19 · strict
> TypeScript · Tailwind v4 · ESLint 9 (`no-console`) · Vitest · Playwright. The
> canonical gate `npm run ci` (typecheck + lint + unit + build + e2e smoke) is green.
> Remaining work is tracked in `.ralph/fix_plan.md` and the parity ledgers under
> `.ralph/specs/`.

## Quick start
```bash
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL to a vidra-core instance
npm install
npm run dev                  # http://localhost:3000
```

## Commands
```bash
npm run ci         # canonical gate: typecheck + lint + unit + build + e2e smoke
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint (no-console enforced; logger module is the only exception)
npm run test       # vitest unit/component tests
npm run build      # next build
npm run analyze    # write Turbopack bundle report to .next/diagnostics/analyze
npm run e2e        # playwright (needs: npx playwright install chromium)
```
The single structured logger is `lib/logger.ts` (raw `console.*` is banned elsewhere).

The bundle report is opt-in and stays out of normal builds and CI. Open
`.next/diagnostics/analyze/index.html` after `npm run analyze` to inspect client/server
modules by route and trace why a dependency is included.

React Compiler remains deliberately disabled. On Next 16.2.9, the Tier 3 comparison
raised the same production build from 18.19s to 47.18s and increased sampled routes'
uncompressed first-load JavaScript by 34–68 KB. Re-run the comparison after meaningful
compiler or framework upgrades rather than enabling it as an unmeasured default.
Likewise, loading fallbacks remain route-specific: a root `app/loading.tsx` was tested
and rejected because it painted a misleading catch-all skeleton while navigating from
the video feed to unrelated destinations such as Login.

## API client
`lib/api/` is the typed client over the `vidra-core` contract: `apiRequest<T>` (a fetch
wrapper that sends `X-Correlation-ID`, maps the `{error:{code,message,…}}` envelope to a
typed `ApiError`, and parses JSON) plus `api.*` functions for the public read endpoints
(instance, feed, video detail, search, channel, channel videos) and
`videoOriginalUrl`/`videoThumbnailUrl` helpers. Types in `lib/api/types.ts` are
hand-maintained against the backend OpenAPI and marked provisional. Configure the target
with `NEXT_PUBLIC_API_BASE_URL` (`lib/config.ts`).

## UI
`components/Header.tsx` is the app-shell header; `components/VideoFeed.tsx` hydrates the
server-streamed first home page and owns client pagination, retry, and fallback states using
`components/VideoCard.tsx` and the `components/ui/*` primitives. The home route
(`app/page.tsx`) is the discovery grid. Playwright keeps server reads backend-less while
route-mocking browser API calls; the backend-backed profile points both paths at the real
stack. The watch page
(`app/videos/[id]` → `components/WatchView.tsx`) plays a video's original via a native
Range-capable `<video>` and shows its metadata, with loading / not-found / error states.

Auth is wired client-side: `components/auth/AuthProvider.tsx` (`useSession`) holds the
session, the access token lives in-memory (`lib/api/auth-store.ts`, auto-attached by the API
client, never persisted to `localStorage`), and the refresh token lives only in the
backend-set httpOnly `vidra_refresh` cookie. Login/signup/MFA completion use cookie mode via
`lib/api/auth.ts`; on boot the provider silently restores from the cookie, and while signed
in it schedules a cookie-mode `/api/v1/auth/refresh` before the access token expires so idle
browsing does not leave the UI holding a stale bearer token. The API client still performs a
single silent refresh + retry after an authenticated request returns 401. The header
`AccountMenu` shows Sign in / username + Sign out. These flows are covered by API/client unit
tests, an `AuthProvider` timer test, and mocked Playwright session specs; proving real cookie
persistence still requires the backend-backed e2e profile.

Search: the header `SearchBox` navigates to `/search?q=` (`app/search` →
`components/SearchResults.tsx`), a client title search reusing the video card and
loading / empty / error / results states.

The public channel page (`app/channels/[handle]` → `components/ChannelView.tsx`) loads a
channel and its videos client-side and renders the channel header (display name, handle,
follower count, description) over a video-card grid, with loading / not-found / error /
empty states.

## Monorepo layout
This is one project inside the Vidra monorepo (a single git repository):

```
vidra/
├── vidra-core/   # Go backend / HTTP API
└── vidra-user/   # this project — Next.js frontend
```

## Tech direction
Next.js · TypeScript (strict) · Tailwind CSS · custom components (no UI framework) ·
minified inline SVG icons · heavy Playwright coverage.

## Docker
A multi-stage `Dockerfile` builds a minimal production image from Next's standalone
output (`next.config.ts` sets `output: "standalone"`; the runtime stage runs
`node server.js` as a non-root user on port 3000).

**Build args — `NEXT_PUBLIC_API_BASE_URL` is baked at BUILD time.** `NEXT_PUBLIC_*`
values are inlined into the client JavaScript bundle when `next build` runs, so the
backend URL the browser calls cannot be changed at `docker run` time. Build one image
per target backend:

```bash
# Build (bake the backend the browser should call; default http://localhost:8080)
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t vidra-user .

# Run
docker run --rm -p 3000:3000 vidra-user
```

Compose service snippet (e.g. alongside the `vidra-core` stack, which serves the API
on host port 8080 — note the browser, not the container, calls the API, so the baked
URL must be reachable from the user's machine):

```yaml
services:
  frontend:
    build:
      context: ./vidra-user
      args:
        NEXT_PUBLIC_API_BASE_URL: http://localhost:8080
    ports:
      - "3000:3000"
    restart: unless-stopped
```

Running without Docker is unchanged: `npm run dev` against `.env.local`, or
`npm run build && npm run start` (standalone output does not break `next start`).

## Backend
Set `NEXT_PUBLIC_API_BASE_URL` to a running `vidra-core` instance. For features that
change data, verification must run against a real backend + PostgreSQL (see
`.ralph/AGENT.md`), not mocks.

## Running Ralph for this project
```bash
cd vidra-user
ralph --live   # uses vidra-user/.ralphrc and vidra-user/.ralph/
```

## License
TBD.
