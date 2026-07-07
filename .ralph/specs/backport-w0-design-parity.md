# W0 — Design/Template Parity (Backport Programme)

**Programme:** `../../.ralph/specs/backport/PROGRAM.md` (monorepo root). Audit basis:
`../../.ralph/specs/backport/W0-DESIGN-AUDIT.md`.
**Canonical visual references (LOOK AT THEM before styling anything):**
- `specs/design/desktop-template.jpeg`
- `specs/design/app-template.jpeg`

## What W0 is (and is not)

The semantic token migration is **already 100% complete** (audited 2026-07-07: zero
legacy color utilities, zero `dark:` branches, zero raw hex in classNames). Do NOT
start a token migration. W0 is a **screen-by-screen visual/layout parity pass**: every
screen must speak the visual language of the two template JPEGs while keeping the
existing token system, accessibility, and e2e suites green.

## Template language checklist (the acceptance vocabulary)

Derived from the JPEGs; `design-system.md` remains the token/component authority.

**Desktop shell**
- Left sidebar order: Home / Trending / Subscriptions / Library / History / Messages /
  Studio, then a `FOLLOWING` section: channel avatars + names + unread/live dot.
- Header: brand left; centered pill search ("Search videos, channels, tags");
  right side `+ Create` pill button, notification bell with dot, avatar menu.
- Content: 3-column video grid, generous whitespace, no boxed/bordered cards.

**Mobile shell**
- Bottom tab bar: Home / Search / Create / Inbox / Library (replaces the hamburger
  for primary navigation; hamburger may remain only for overflow/secondary items).
- Large page title ("Vidra") with bell + avatar in a compact top row.

**Shared vocabulary**
- Pill filter chips (e.g. Recent / Popular / Trending) — filled = active, outlined =
  inactive.
- "Live now" rail: horizontally scrolling cards with `● LIVE` badge (top-left) and
  "N watching" chip (bottom-right), stream count at rail's right edge.
- Video cards: borderless rounded-2xl thumbnails on the page background; duration
  chip bottom-right; `IPFS` badge top-right where applicable; below: avatar +
  two-line metadata (title first, then muted `channel · views · age`).
- Apple-HIG feel: restrained type scale, clear hierarchy, generous spacing,
  focus-visible rings, respects `prefers-reduced-motion`.

## Working rules (every W0 task)

1. **Before/after evidence.** Capture the screen BEFORE and AFTER (light + dark ×
   mobile + desktop viewports) with Playwright into `.ralph/design-review/w0/<area>/`
   (git-ignored; add the ignore entry in the first task). Summarize what changed in
   the fix_plan task note.
2. **Tokens only.** No new raw colors, no `dark:` branches, no UI-framework imports.
   The existing token grep guard must stay clean.
3. **Don't break the suites.** Update e2e selectors/specs in the same slice; the full
   mocked suite and `npm run ci` must be green before the box ticks. Axe/a11y suites
   stay green (the redesign may not regress landmarks, names, or contrast).
4. **Vertical and small.** One feature area per slice. If a template element needs a
   missing backend capability (e.g. live "N watching" counts), style the surface with
   the data available and record the dependency in the note — do NOT stub fake data
   into production components.
5. Where the template conflicts with `design-system.md`, the JPEG wins for layout and
   the design-system wins for tokens/components; record any deliberate deviation in
   the task note.
