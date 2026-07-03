# Vidra User — Design System

> Status: FOUNDATION LANDED (slice `user-primitives`). Component primitives,
> design tokens, the typed icon set, an i18n readiness seam, and RTL
> component-unit tests are in place. Use the uploaded Vidra design docs as the
> visual source of truth when present.

## Default direction
- Apple-inspired responsive layout.
- Mobile bottom tabs; desktop/tablet sidebar.
- No hamburger menus for primary navigation.
- Semantic color tokens, not scattered hex values.
- Accessible focus rings.
- Dark mode support (via `prefers-color-scheme`).
- Reduced-motion and reduced-transparency support.
- Custom components, not UI-kit wrappers.

## Design tokens (`app/globals.css`)
Tokens are defined as raw CSS custom properties in `:root` (light) with a
`@media (prefers-color-scheme: dark)` override, then exposed to Tailwind as
`--color-*` utilities via `@theme inline`. Because the utilities reference the
raw vars, every token flips in dark mode automatically — the primitives do NOT
carry `dark:` variants.

### Color (semantic)
| Token utility | Meaning | Light | Dark |
|---|---|---|---|
| `surface` | page/card background | `#ffffff` | `#18181b` |
| `surface-muted` | hover fills, subtle panels | zinc-100 | zinc-800 |
| `surface-raised` | popovers/menus | `#ffffff` | `#18181b` |
| `fg` | primary text | zinc-900 | zinc-100 |
| `fg-muted` | secondary text | zinc-500 | zinc-400 |
| `fg-subtle` | placeholders/disabled | zinc-400 | zinc-500 |
| `border` | inputs/buttons | zinc-300 | zinc-700 |
| `border-subtle` | card dividers | zinc-200 | zinc-800 |
| `accent` | primary action bg | zinc-900 | zinc-100 |
| `accent-fg` | primary action text | white | zinc-900 |
| `focus` | focus ring | zinc-500 | zinc-500 |
| `danger` / `danger-fg` | destructive | red-600 / white | red-500 / white |
| `success`, `warning` | status | green-600, amber-600 | green-500, amber-500 |

Use e.g. `bg-surface`, `text-fg`, `text-fg-muted`, `border-border`,
`bg-accent text-accent-fg`, `text-danger`. Values intentionally mirror the
zinc/red palette the app was hand-writing, so moving a surface onto tokens is a
visual no-op.

### Spacing / radius / typography
Stay on **Tailwind's default scale** (already used app-wide): spacing `gap-*` /
`px-*` / `py-*`, radius `rounded-md` (controls) / `rounded-lg` (cards) /
`rounded-full` (pills/avatars), type `text-xs`/`text-sm`/`text-base` with
`font-medium`/`font-semibold`. No bespoke scale — the defaults are the scale.

### Focus (centralized)
`.focus-ring` (plain CSS in `globals.css`) is the single source of the keyboard
focus outline: a 2px surface-colored gap + a 2px `--focus` ring, shown only on
`:focus-visible`. Every interactive primitive adds `focus-ring` instead of
hand-writing `focus-visible:ring-*`. Reduced-motion neutralizes primitive
transitions/animations globally.

## Component primitives (`components/ui/`)
Import from the barrel `@/components/ui` (individual files still importable).

| Primitive | Notes / a11y |
|---|---|
| `Button` | variants primary/secondary/danger/ghost, sizes sm/md/lg; defaults `type="button"`. Shares `buttonClasses` with `LinkButton`. |
| `LinkButton` | Next `<Link>` styled as a button. |
| `IconButton` | icon-only; **requires** `label` (→ aria-label + title). |
| `Input`/`Textarea` | `label`/`hint`/`error`; auto id via `useId`; wires `aria-invalid`/`aria-describedby`. |
| `Select` | native `<select>` (native keyboard/AT) + decorative chevron. |
| `Checkbox`/`Radio` | native input wrapped in its `<label>` (implicit association). |
| `Toggle` | `role="switch"` + `aria-checked`; Space/Enter toggle. |
| `Modal` | `role="dialog" aria-modal` labelled by its `<h2>`; focus trap + restore, Escape + backdrop close. |
| `Dropdown` | menu-button pattern; `aria-haspopup`/`aria-expanded`, Arrow/Home/End/Escape, outside-click close. |
| `Tabs` | WAI-ARIA tabs; roving tabindex, Arrow/Home/End, selection follows focus. |
| `Toast` + `ToastProvider` | `useToast()`; polite `role=status` / assertive `role=alert` (errors); auto-dismiss + dismissible. |
| `Card`, `Badge`, `Skeleton` | presentational surfaces/pills/loading blocks. |
| `Avatar`, `Spinner`, `EmptyState`, `ErrorState`, `LoadMoreButton` | pre-existing, kept. |

### Route-backed sub-navs
The admin/moderation tab bars are **links** (real navigation) and intentionally
stay `<Link>` lists — the `Tabs` primitive is for in-page, state-driven tabs.

## Icons (`components/icons/`)
Typed, minified inline SVG set (Feather-style, 24×24, 2px stroke) behind a
shared `<Icon>` base: Search, Close, Check, ChevronDown/Right/Left, Flag, Bell,
Menu, Plus, Trash, Info, Warning, ExternalLink. Decorative by default
(`aria-hidden`); pass `label` for a standalone named image. No icon-font / sprite
dependency.

## i18n readiness (`lib/i18n`) — P12
A lightweight seam, **not** a translation system. `lib/i18n/en.ts` is the
single default-locale catalog (dotted keys, `{placeholder}` interpolation);
`t(key, vars)` reads it. The key type is `MessageKey`, so `t()` with an unknown
key is a compile error — the catalog can never silently drift from call sites.
Proven on the primitives (Modal/Toast close/dismiss labels) and the report
modal. When real localization lands, only `activeCatalog` gains a locale
resolver; call sites do not change.

## Testing
- **RTL component-unit tests** (`components/ui/*.test.tsx`): `@testing-library/react`
  + jsdom under Vitest (per-file `// @vitest-environment jsdom` docblock; node
  stays the default for `lib/*`). Examples cover Button, Modal (focus/Escape/
  backdrop/trap), Tabs (keyboard/aria), Toast (roles/auto-dismiss), Select
  (label/aria). This closes the P14 "component test examples" gap.
- **Mocked Playwright** remains the integration/e2e layer; the refactored
  surfaces (auth forms, report modal, admin overview) keep their existing
  selectors green.

## Accessibility baseline
- ARIA labels on icon-only controls (enforced by `IconButton`).
- Keyboard navigation + focus management for dialogs/menus/tabs.
- Centralized visible focus ring (`.focus-ring`).
- Responsive coverage for mobile/tablet/desktop; reduced-motion respected.
