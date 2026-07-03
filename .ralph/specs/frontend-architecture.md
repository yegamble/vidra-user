# Vidra User — Frontend Architecture (skeleton)

> Status: SKELETON — survey/coverage incomplete. Expand as the app is built.

## App structure (target)
- `src/app` — Next.js app-router routes (deliberate server/client boundaries).
- `src/components` — reusable custom components (no UI framework).
- `src/features` — feature-specific UI and hooks.
- `src/lib/api` — API client + generated/backend-aligned types.
- `src/lib/auth` — auth/session client logic.
- `src/lib/design` — tokens, SVG/icon helpers, accessibility utilities.
- `tests` / `src/test` — unit, integration, Playwright.

## Principles
- Consume the `vidra-core` API contract; never invent response shapes.
- Strict TypeScript. Components small, accessible, typed, testable.
- Custom components + Tailwind; minified inline/local SVG icons.
- Do not make every component a client component by default.

## API client boundary
- `NEXT_PUBLIC_API_BASE_URL` configures the backend target.
- Prefer generated types from backend OpenAPI when available; mark hand-maintained
  types as provisional/pending contract.

## Verification boundary (critical)
- Data-mutating flows must be proven against a real `vidra-core` + PostgreSQL.
  Mocks are for UI scaffolding only. See `.ralph/PROMPT.md` and `.ralph/AGENT.md`.

## Component primitives + tokens
- Primitive layer lives in `components/ui/` (barrel `@/components/ui`); semantic
  design tokens + centralized `.focus-ring` in `app/globals.css`; typed inline
  SVG icons in `components/icons/`. See `.ralph/specs/design-system.md`.
- i18n readiness seam: `lib/i18n` (`t()` + default-locale catalog). Readiness
  only — not a translation system.

## Open questions / TODO
- [x] Pick unit/component test framework and API-mocking approach. (Vitest for
  unit + RTL (`@testing-library/react` + jsdom, per-file docblock) for component
  units; Playwright `page.route` for mocked e2e — MSW not adopted.)
- [x] Define the Playwright `backend-backed` project and DB-effect assertion helper.
  (`e2e-backed/` + `fixtures.ts`; see `.ralph/AGENT.md`.)
- [x] Define design tokens (see design-system.md).
