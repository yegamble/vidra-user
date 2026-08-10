# AGENTS.md — vidra-user

Next.js 16 (App Router) frontend for vidra, a self-hostable video platform.
The backend is a separate Go API (yegamble/vidra-core); this repo talks to it
only through the generated OpenAPI contract. Users arrive with YouTube muscle
memory: match YouTube's layout ergonomics (structure, proportions, icon sizes,
responsive behavior) while keeping this repo's Apple design language for the
visual skin.

## Verification gates (run before opening any PR; paste the output tail into the PR body)

```
npx tsc --noEmit
npm run lint
npm run lint:icons
npm run test          # vitest, ~1.4k tests
```

- Do NOT run `npm run e2e` or the e2e-backed suite: they need a real backend
  and browser fleet. Repo CI covers them. Never claim a suite passed that you
  did not run — name what you could not run.
- Never weaken or delete an existing e2e spec to make a change fit.

## Hard rules

1. **One small PR per session** (< 300 changed lines). List every other
   finding in the PR body under "Also found (not fixed here)" instead of
   fixing it.
2. **TDD**: write the failing test first. A bugfix without a reproducing test
   will be rejected. Component tests live beside the component
   (`*.test.tsx`, `// @vitest-environment jsdom` when DOM is needed); pure
   logic tests run in node env.
3. **Never hand-edit `lib/api/generated.ts`**. Regenerate it:
   ```
   curl -fsSL https://raw.githubusercontent.com/yegamble/vidra-core/main/api/openapi.yaml -o /tmp/openapi.yaml
   OPENAPI_PATH=/tmp/openapi.yaml npm run codegen
   ```
4. **Contract is core-first**: never invent an endpoint or field the OpenAPI
   spec lacks. If a task needs one, open an issue describing the exact
   contract addition and stop (or ship only the part that degrades
   gracefully without it).
5. **Design system**: read `design-system.md` before any UI change. SVG icons
   only (`npm run lint:icons` enforces it — no emoji/glyph icons), design
   tokens over hardcoded colors (light + dark themes both matter), match
   existing idioms: `EmptyState`/`ErrorState`/`Spinner`, `Dropdown`
   `triggerVariant="icon"`, portal patterns for menus/modals.
6. **Do not bump dependencies** (Dependabot owns bumps), do not touch
   `.github/workflows`, never commit secrets or `.env` files.

## Known failure classes to watch for (real precedents)

- Type-union switches missing a case: `new_video` notifications rendered as
  "started following" for weeks because `describeNotification` had no case.
- Contract fields fetched but ignored: `FollowButton` ignored the shipped
  `is_following` flag.
- Fetch-once-never-refresh badges: the AdminConsole queue badge.
- Icon squeeze: the kebab icon rendered at 8–12px instead of 20px because
  `p-0` could not beat `px-3.5` without tailwind-merge.
- Dead controls: components exported but never imported
  (`AdminNavLink.tsx`, `ModerationNavLink.tsx` were orphans).

## PR conventions

- Title: `[<agent>] <area>: <summary>` (e.g. `[jules] notifications: ...`).
- Body opens with a one-line WHY, then the verification output tail.
- Never describe an exploitable-but-unfixed security issue in detail in a
  public PR or issue — flag it as "security: needs owner attention" with
  minimal detail.
