<p align="center">
  <a href="https://github.com/yegamble/vidra">
    <img src="https://raw.githubusercontent.com/yegamble/vidra-branding/main/assets/logo/vidra-icon.svg" width="72" alt="Vidra">
  </a>
</p>

# Vidra User

The TypeScript **Next.js** frontend for **Vidra** — a clean-room, PeerTube-inspired
federated video platform. This project (`vidra-user`) is the full user-facing app: watch
and browse, search, the creator studio, admin, playlists, direct messages, live, settings,
and moderation.

It consumes the HTTP API served by the sibling **`vidra-core`** Go backend at runtime; the
frontend ships no database of its own. The two repos are tied together by the **`vidra`**
meta-repo, which describes how to run the whole platform.

- Backend: https://github.com/yegamble/vidra-core
- Meta-repo: https://github.com/yegamble/vidra

Stack: Next.js 16 (app router) · React 19 · strict TypeScript · Tailwind v4 · ESLint 10
(`no-console`) · Vitest · Playwright.

## Prerequisites

| Need | Why |
|------|-----|
| Node.js 24 + npm | Runtime and package manager (CI runs Node 24) |
| `npx playwright install chromium` | Required before running any Playwright suite |
| Docker (optional) | For the production image or a local backend stack |
| A running `vidra-core` stack | Only for the backend-backed e2e suite |

## Quick start

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL (default http://localhost:8080)
npm install
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | What |
|--------|------|
| `npm run dev` | Next dev server on http://localhost:3000 |
| `npm run build` | `next build` (a `prebuild` hook auto-copies the olm wasm for E2EE) |
| `npm run start` | Serve the built standalone output |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (`no-console`; `lib/logger.ts` is the only exception) |
| `npm run lint:icons` | Bans emoji/glyph icons (`scripts/check-no-emoji.mjs`) |
| `npm run test` | Vitest unit/component tests |
| `npm run e2e` | Mocked Playwright suite — no backend needed |
| `npm run e2e:backed` | Backend-backed Playwright suite — requires a live `vidra-core` |
| `npm run codegen` | Regenerate `lib/api/generated.ts` from vidra-core's OpenAPI spec |
| `npm run analyze` | Opt-in bundle report to `.next/diagnostics/analyze` |
| `npm run ci` | The canonical gate (see below) |

**`npm run ci` is the canonical gate** and runs:

```
typecheck && lint && lint:icons && test && build && e2e
```

## Environment variables

App vars are read once, typed, in `lib/config.ts` (`LOG_LEVEL` in `lib/logger.ts`;
the `E2E_*` vars in `playwright.config.ts`). Never commit a real `.env` or any secret.

| Var | Scope | Meaning |
|-----|-------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | build + browser | Backend URL the browser calls. **Baked at build time** — one image/build per backend. Default `http://localhost:8080` |
| `INTERNAL_API_BASE_URL` | server only | Override for server-side fetches (compose/service DNS); falls back to the public URL |
| `LOG_LEVEL` | server | `debug \| info \| warn \| error` (default `info`) |
| `OTEL_ENABLED` | server | `true` registers the OTel SDK and injects W3C `traceparent` on server-side calls |
| `OTEL_SERVICE_NAME` | server | OTel service identity (default `vidra-user`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | server | OTLP exporter target |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | server | OTLP protocol (e.g. `http/protobuf`) |
| `E2E_PORT` | test | Playwright app port, default `3000`. **Set it when 3000 is taken** — `reuseExistingServer` is deliberately false, so an occupied port fails loudly |
| `E2E_API_URL` | test | Points the backed suite's server reads at a real `vidra-core` |

## Testing

Three layers:

- **Unit / component** — `npm run test` runs Vitest against the `*.test.ts(x)` files
  colocated in `lib/`, `components/`, and `app/`.
- **Mocked e2e** — `npm run e2e` runs the Playwright `chromium` project over `e2e/`
  (~90 specs). Every network call is intercepted; **no backend is required**. This is the
  suite `npm run ci` runs.
- **Backend-backed e2e** — `npm run e2e:backed` runs the `backend-backed` project over
  `e2e-backed/` (~68 specs). It needs a live `vidra-core` stack and an app built against
  it, and seeds a deterministic admin via a `backed-setup` project (`admin.setup.ts`). See
  `.ralph/AGENT.md` for the full recipe.

Accessibility is asserted with `@axe-core/playwright` in the mocked suite (`e2e/a11y.spec.ts`
and `e2e/search-discovery.spec.ts`).

## The API contract

`vidra-core/api/openapi.yaml` is the single source of truth. `npm run codegen` regenerates
`lib/api/generated.ts` from it (resolution: `$OPENAPI_PATH`, else the sibling `../vidra-core`
checkout). `lib/api/types.ts` is **derived from `generated.ts` — never hand-edit shapes there**;
change the spec in vidra-core, re-run `npm run codegen`, and commit the refreshed `generated.ts`.

`contract-ci` guards twice: `scripts/check-contract.mjs` asserts every `/api/` path the
frontend calls exists in the spec, and a freshness step fails if `generated.ts` is stale
against the spec.

The typed client lives in `lib/api/` (`endpoints.ts`, `client.ts`, plus SSE and
resumable-upload helpers).

## Project structure

```
app/            # 20+ route groups: videos (watch), search, studio, admin, playlists,
                #   messages, live, settings, moderation, channels, library, trending…
components/     # UI: app-shell, video cards/feed, player, auth, ui/* primitives
lib/            # api/  — typed client + OpenAPI contract (generated.ts, types.ts)
                # config.ts — typed env
                # logger.ts — the ONLY place raw console.* is allowed
e2e/            # mocked Playwright specs (network intercepted, no backend)
e2e-backed/     # backend-backed Playwright specs (real vidra-core + Postgres)
scripts/        # codegen, contract check, icon lint, olm-wasm copy
.ralph/         # agent instructions + specs (design-system, frontend-architecture, testing)
```

## Docker

Multi-stage build on Next's standalone output. `NEXT_PUBLIC_API_BASE_URL` is baked at build
time, so build one image per target backend:

```bash
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t vidra-user .
docker run --rm -p 3000:3000 vidra-user
```

The runtime image runs `node server.js` as a non-root user on port 3000. Releases publish a
GHCR image via `publish-container`, baking the URL from the `NEXT_PUBLIC_API_BASE_URL` repo
variable.

## CI

- **frontend-ci** — runs `npm run ci`.
- **contract-ci** — path check + `generated.ts` codegen-freshness against vidra-core's spec.
- **frontend-e2e-backed** — spins up a `vidra-core` stack and runs the backed suite.
- **ci-guard** — repository CI guardrail.
- **publish-container** — builds and pushes the GHCR image on release.

## License

vidra-user is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
