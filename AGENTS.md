# AGENTS.md — vidra-user

Next.js 16 (App Router) frontend for vidra, a self-hostable video platform.
The backend is a separate Go API (yegamble/vidra-core); this repo talks to it
only through the generated OpenAPI contract. Users arrive with YouTube muscle
memory: match YouTube's layout ergonomics (structure, proportions, icon sizes,
responsive behavior) while keeping this repo's Apple design language for the
visual skin.

## CI: what "required for merge" means

One check stands for the whole required set: **`ci-required`** — the only name
that belongs in branch protection for this repo. It reads
[`.github/required-checks.txt`](.github/required-checks.txt), the checked-in
definition of required, and fails if any listed lane failed, was cancelled,
timed out, or **never ran**.

Required: `frontend`, `contract`, `e2e-backed (local)`, `e2e-backed (s3)`,
`channel-sync-backed`, `ipfs-backed`, plus `guard` when its path filter fires.

**`contract` is core-first, and its red is correct.** It checks this client
against vidra-core's DEFAULT BRANCH, so a PR here that consumes a new endpoint
stays red until the core PR adding it has MERGED. Land core first, then re-run.
Never drop it to unblock a merge — it is the only check that notices the client
calling an endpoint the backend does not serve.

**No silent skips.** Playwright reports a skipped test as neither pass nor fail
and exits 0, so a spec that bows out because the stack is not the stack it needs
leaves its lane green having proved nothing. Every lane now runs
`scripts/ci/assert-no-skipped-tests.mjs` over the JSON report:

- the mocked suite and the single-purpose lanes (`channel-sync-backed`,
  `ipfs-backed`, and the optional `quarantine-backed`) use
  `scripts/ci/allowed-skips-none.txt` — **empty**. These lanes run one or two
  specs and are the only automated proof those flows have; a skip there means
  the job tested nothing;
- the main backed matrix uses `scripts/ci/allowed-skips-backed.txt`, which names
  every environment-gated spec and says where it DOES run. Adding a line removes
  a flow from its only automated proof — a reviewed decision with a written
  reason, never a convenience.

Specs whose stack contradicts the main matrix live in
`.github/workflows/frontend-e2e-optional.yml` (schedule + manual, never a merge
gate), each with the gating variable SET and a zero-skip audit: an optional lane
may be absent, it may not be falsely green. That file also lists, with reasons,
the four specs still not wired anywhere — `search-discovery` is the remaining
half of finding F04.

`vitest.config.ts` states `passWithNoTests: false` so a glob edit that matches
nothing cannot turn the unit gate into a no-op that still exits 0.

**Toolchain and manifest.** CI pins Node **26** — this repo's stated runtime
(`engines.node: ">=26"`, `.nvmrc`/`.node-version`) and the runtime the published
container image ships, since all three `Dockerfile` stages build on
`node:26-alpine` — and installs with `npm ci`, never `npm install`; `ci-guard`
fails a workflow that uses the latter. The manifest, every `setup-node` and the
image are one number on purpose (A39 finding F09, owner ruling 2026-09-08:
Node 26 everywhere); a bump moves all of them in the same commit or it
reintroduces the drift.

**Artifacts.** Every lane uploads its Playwright HTML report, JSON report,
traces and (on failure) the backend compose log, 14-day retention:
`frontend-ci-reports`, `playwright-backed-report-local`,
`playwright-backed-report-s3`, `playwright-channel-sync-report`,
`playwright-ipfs-report`, `playwright-quarantine-report`. vitest emits JUnit
under CI into the same bundle.

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
5. **Design system**: read `.ralph/specs/design-system.md` before any UI
   change (it is committed, but not at the repo root — the old bare
   `design-system.md` reference sent agents hunting for a file that does not
   exist there). SVG icons only (`npm run lint:icons` enforces it — no
   emoji/glyph icons), design tokens over hardcoded colors (light + dark
   themes both matter), match existing idioms:
   `EmptyState`/`ErrorState`/`Spinner`, `Dropdown` `triggerVariant="icon"`,
   portal patterns for menus/modals.
6. **Do not bump dependencies** (Dependabot owns bumps), do not touch
   `.github/workflows`, never commit secrets or `.env` files.

## Git hygiene — finished means merged (all agents / AI tools)

These rules bind every AI tool working in this repo (Claude, Jules, Codex, …):

1. **Commit early, push often.** Work on a short-lived branch off `main`.
   Prefer several small, scoped commits over one session-end mega-commit, and
   push the branch at every green checkpoint — unpushed work does not exist.
2. **A task is finished only when its work is merged to `main` and pushed.**
   Once the verification gates and the PR's CI are green, merge the PR before
   declaring the task done. If you cannot merge (no permission, review
   requested, red CI), report the task as **open — awaiting merge**, never as
   finished/complete/done.
3. **Delete merged branches.** Immediately after a merge: delete the work
   branch on the remote (`git push origin --delete <branch>`), delete it
   locally (`git branch -d <branch>`), then `git fetch --prune`. Also sweep
   for leftovers each session: delete any local (`git branch --merged
   origin/main`) or remote (`git branch -r --merged origin/main`) branch
   already merged into `origin/main`. Never delete `main`, the branch you are
   on, or an unmerged branch — an unmerged stray is reported for triage, not
   deleted.

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
