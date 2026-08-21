<p align="center">
  <a href="https://github.com/yegamble/vidra">
    <img src="https://raw.githubusercontent.com/yegamble/vidra-branding/main/assets/logo/vidra-icon.svg" width="72" alt="Vidra">
  </a>
</p>

<h1 align="center">vidra-user</h1>

<h3 align="center">The face of Vidra — a video app your viewers already know how to use.</h3>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#the-product-surface">Product surface</a> ·
  <a href="#design-system--accessibility">Design system</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#the-api-contract">API contract</a>
</p>

<p align="center">
  <a href="https://github.com/yegamble/vidra-user/actions/workflows/frontend-ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/yegamble/vidra-user/frontend-ci.yml?label=frontend-ci" alt="frontend-ci"></a>
  <a href="https://github.com/yegamble/vidra-user/releases"><img src="https://img.shields.io/github/v/release/yegamble/vidra-user?label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/yegamble/vidra-user" alt="License: AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-087EA4?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind v4">
  <img src="https://img.shields.io/badge/Playwright-e2e-2EAD33?logo=playwright&logoColor=white" alt="Playwright">
</p>

The TypeScript **Next.js** frontend for **Vidra** — a clean-room, PeerTube-inspired
federated video platform you install yourself. This project (`vidra-user`) is the full
user-facing app: watch and browse, search, the creator studio, admin, playlists, direct
messages, live, settings, and moderation.

It consumes the HTTP API served by the sibling **`vidra-core`** Go backend at runtime; the
frontend ships no database of its own. The two repos are tied together by the **`vidra`**
meta-repo, which describes how to run the whole platform.

- Backend: https://github.com/yegamble/vidra-core
- Meta-repo: https://github.com/yegamble/vidra
- Brand & design: https://github.com/yegamble/vidra-branding

Stack: Next.js 16 (app router) · React 19 · strict TypeScript · Tailwind v4 · ESLint 10
(`no-console`) · Vitest · Playwright.

## The product surface

A bespoke, token-driven video UI — no component kit, no webfont download, first paint
in the platform's own face:

- **Watch**: a custom hls.js player with keyboard shortcuts, picture-in-picture and
  theatre mode, resume positions, captions and clickable timestamps.
- **Browse**: YouTube-ergonomic home with shelves and an admin-curated featured banner,
  trending, subscriptions, history and library.
- **Create**: a tabbed Studio — uploads with instant autostart and
  publish-after-transcode, channel management, per-channel federation protocol flags,
  collaborators.
- **Connect**: sign in with Bluesky or any ATProto PDS; direct messages with optional
  end-to-end encryption (Olm, via WASM).
- **First run**: one-time owner-claim at `/setup/claim` (token from the api boot log) gates all signup until redeemed; admin-curated featured banner on the home feed.
- **Everywhere**: installable PWA, embeds, RSS/oEmbed discovery, per-user sensitive-content
  policy with creator content warnings.

## Design system & accessibility

The UI implements the documented
[Vidra design system](https://github.com/yegamble/vidra-branding/blob/main/design-system/README.md):
Apple HIG foundations, semantic `light-dark()` tokens (no `dark:` variants, no hardcoded
hex), one accent, and a glass material reserved for the navigation layer. **WCAG 2.2 AA
is a hard gate** — axe runs in the mocked e2e suite and serious/critical findings fail
CI; emoji glyphs are banned by a lint (`npm run lint:icons`); accessible names are
asserted in tests so a restyle cannot silently rename a control.

## Prerequisites

| Need | Why |
|------|-----|
| Node.js 24+ + npm | Runtime and package manager (CI runs Node 24, image builds on `node:26-alpine`, `@types/node` ^26) |
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
| `npm run generate:icons` | Regenerate PWA icon variants from the source SVG |
| `npm run design:shots` | Capture design-system screenshots for visual review |
| `npm run ci` | The canonical gate (see below) |

**`npm run ci` is the canonical gate** and runs:

```
typecheck && lint && lint:icons && test && build && e2e
```

## Environment variables

App vars are read once, typed, in `lib/config.ts` (`LOG_LEVEL` in `lib/logger.ts`;
`PUBLIC_BASE_URL` per request in `proxy.ts`; the `E2E_*` vars in
`playwright.config.ts`). Never commit a real `.env` or any secret.

| Var | Scope | Meaning |
|-----|-------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | build + browser | Dev/e2e override for the backend URL the browser calls, inlined at build time. Unset, a production build defaults to **same-origin relative URLs** (dev/test default `http://localhost:8080`) |
| `PUBLIC_API_BASE_URL` | runtime | Browser-facing API origin, served per page load via `/runtime-config.js` — repoint a running container without a rebuild. Empty = same-origin |
| `API_BASE_URL` | runtime, server only | Server-side fetch target (compose/service DNS, e.g. `http://api:8080`) |
| `INTERNAL_API_BASE_URL` | runtime, server only | Historical alias for `API_BASE_URL` (wins when both are set); falls back to the public URL |
| `PUBLIC_BASE_URL` | runtime, server only | The **site** origin — a different thing from the API origins above. Its scheme decides whether `proxy.ts` emits `Strict-Transport-Security`: https, unset, or unparseable emit (fail-secure); an explicit `http://` origin (the deliberate plain-http deployment mode) suppresses it |
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
  (94 specs). Every network call is intercepted; **no backend is required**. This is the
  suite `npm run ci` runs.
- **Backend-backed e2e** — `npm run e2e:backed` runs the `backend-backed` project over
  `e2e-backed/` (71 specs). It needs a live `vidra-core` stack and an app built against
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
                #   messages, live, settings, moderation, channels, library, trending, setup/claim…
components/     # UI: app-shell, video cards/feed, player, auth, ui/* primitives
lib/            # api/  — typed client + OpenAPI contract (generated.ts, types.ts)
                # config.ts — typed env
                # logger.ts — the ONLY place raw console.* is allowed
                # owner-claim.ts — first-run gate helpers
e2e/            # mocked Playwright specs (94, network intercepted, no backend)
e2e-backed/     # backend-backed Playwright specs (71, real vidra-core + Postgres)
scripts/        # codegen, contract check, icon lint, olm-wasm copy
.ralph/         # agent instructions + specs (design-system, frontend-architecture, testing)
```

## Docker

Multi-stage build on Next's standalone output. The image is **generic**: the API origin is
runtime configuration, so one image serves any domain:

```bash
docker build -t vidra-user .
# Single-origin (Caddy path-routes /api/* to vidra-core): browser calls stay relative.
docker run --rm -p 3000:3000 -e API_BASE_URL=http://api:8080 vidra-user
# Cross-origin: repoint the browser too, no rebuild.
docker run --rm -p 3000:3000 -e API_BASE_URL=http://api:8080 \
  -e PUBLIC_API_BASE_URL=https://api.example.com vidra-user
```

`--build-arg NEXT_PUBLIC_API_BASE_URL=…` still bakes a fixed origin for special builds. The
runtime image runs `node server.js` as a non-root user on port 3000. Releases publish the
generic GHCR image via `publish-container`.

## CI

- **frontend-ci** — runs `npm run ci`.
- **contract-ci** — path check + `generated.ts` codegen-freshness against vidra-core's spec.
- **frontend-e2e-backed** — spins up a `vidra-core` stack and runs the backed suite.
- **ci-guard** — repository CI guardrail.
- **publish-container** — builds and pushes the GHCR image on release.

## License

vidra-user is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
