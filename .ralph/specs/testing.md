# Vidra User — Testing

Status: living document. Tests serve implementation; they are not busywork.

This is the **frontend** (Next.js 16 App Router). The Go backend has its own
testing doc in the `vidra-core` repo — do not look for `make cover`, migrations
or Newman here.

## Layers

- **Unit / pure logic** — `lib/**/*.test.ts`, run in Vitest's default `node`
  environment. Contract helpers, formatters, the API client, short-code
  encoding, event-stream parsing. No DOM, no network.
- **Component** — `components/**/*.test.tsx` and `app/**/*.test.tsx`, using
  Testing Library. These opt into jsdom **per file** with a
  `// @vitest-environment jsdom` docblock, so the node suites never pay for
  jsdom. A component test asserts behaviour (what the user sees and can do),
  not implementation detail.
- **Mocked e2e** — Playwright `chromium` project over `e2e/` (97 specs). Every
  network call is intercepted; **no backend required**. This is the suite
  `npm run ci` runs.
- **Backend-backed e2e** — Playwright `backend-backed` project over
  `e2e-backed/` (75 specs). Needs a live `vidra-core` stack and an app built
  against it; a `backed-setup` project (`admin.setup.ts`) seeds a deterministic
  admin first. Recipe in `.ralph/AGENT.md`.

Accessibility is asserted with `@axe-core/playwright` in the mocked suite
(`e2e/a11y.spec.ts`, `e2e/search-discovery.spec.ts`).

## How to run

```bash
npx tsc --noEmit      # types
npm run lint          # eslint
npm run lint:icons    # SVG-only icon guard (no emoji/glyph icons)
npm run test          # vitest — 226 files, ~2.3k tests, no backend needed
```

Those four are the gate before opening a PR. `npm run e2e` and
`npm run e2e:backed` need a browser fleet and a real backend respectively —
repo CI owns them. **Never claim a suite passed that you did not run**; name
what you could not run.

## The contract layer

`vidra-core/api/openapi.yaml` is the source of truth. `scripts/check-contract.mjs`
asserts every `/api/` path the frontend calls exists in the spec (path params
compared structurally, so `{id}` and `{videoId}` both normalize). A codegen
freshness step fails if `lib/api/generated.ts` is stale. Never hand-edit
`generated.ts`.

## Conventions

- **TDD**: the failing test comes first. A bugfix without a reproducing test
  is rejected.
- Mocked-green is **not** evidence a feature works. A mocked spec can fabricate
  a response field the real API never sends and stay green for months — that
  is exactly how the IPFS watch toggle shipped unreachable. When a spec asserts
  on a contract field, confirm the field is actually in the OpenAPI response
  shape for that endpoint, not just in the mock.
- Prefer behaviour assertions over coverage-chasing.
- Never weaken or delete an existing e2e spec to make a change fit.
- A `loading.tsx` on a route turns `notFound()` into a **soft** 404 and a
  redirect into a **soft** redirect — vitest cannot see that. Verify such routes
  with a real build plus `curl -i`.
