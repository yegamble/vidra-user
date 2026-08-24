"use client";

import type { FormEvent } from "react";

import { SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import type { UserRole } from "@/lib/api";
import { cn } from "@/lib/cn";

// Shared admin/moderation surface vocabulary (backport W0.11). These encode the
// admin-template language — the borderless surface-muted panel, the pill search
// toolbar, and the role badge — so every admin surface speaks it consistently.
// Token-driven; no raw palette, no dark: branches.

/**
 * ADMIN_PANEL — the template's borderless list-item / card surface. The admin
 * template paints its report/quarantine/request/list cards on a quiet
 * `surface-muted` fill with no border (deference: chrome recedes, the content
 * carries the hierarchy), unlike a bordered `surface` card.
 */
export const ADMIN_PANEL = "rounded-2xl bg-surface-muted p-4";

/**
 * AdminSearch — the admin toolbar's pill search field (search glyph inside a
 * `surface-muted rounded-full` field) plus a submit and an optional clear. The
 * inner input is unstyled/transparent; the wrapper carries the focus ring via
 * `has-[:focus-visible]` so keyboard focus is still obvious (a11y contract).
 */
export function AdminSearch({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  onClear,
  hasQuery,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  hasQuery: boolean;
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form role="search" className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface-muted px-4 py-2 transition-colors sm:max-w-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus">
        <SearchIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />
        <input
          type="search"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
      </div>
      <Button type="submit" size="sm">
        Search
      </Button>
      {hasQuery ? (
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear
        </Button>
      ) : null}
    </form>
  );
}

/**
 * AdminPagination — the admin surfaces' limit/offset pager: a `start–end of
 * total` readout on the left, Previous / Next on the right. It renders nothing
 * when the whole result set already fits on the first page, so a small instance
 * never sees pagination chrome it has no use for.
 *
 * It needs a real `total` from the endpoint. Without one a client cannot tell a
 * last page from a truncated one, which is the difference between "that is
 * everybody" and "there are 4,549 more" — so a surface whose contract carries no
 * total must not fake this control.
 *
 * `label` names the rows for the nav's accessible name ("Paginate users").
 */
export function AdminPagination({
  total,
  limit,
  offset,
  onOffset,
  label,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (offset: number) => void;
  label: string;
}) {
  if (total <= limit && offset === 0) return null;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  return (
    <nav
      aria-label={`Paginate ${label}`}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <span className="text-xs tabular-nums text-fg-muted">
        {start}–{end} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => onOffset(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={offset + limit >= total}
          onClick={() => onOffset(offset + limit)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

const ROLE_PILL: Record<UserRole, string> = {
  // Admin is the emphasised role: the documented `inverse` Badge chip
  // (`bg-fg text-canvas` — a black/near-black pill). Accent is reserved for
  // interactive/selected state, not decorative role labels (design-system.md).
  admin: "bg-fg text-canvas",
  // Moderator is a quiet neutral chip.
  moderator: "bg-surface-strong text-fg-muted",
  // Regular user: an outlined chip so the list reads calmly (most rows).
  user: "border border-border text-fg-muted",
};

/**
 * RolePill — the template's account-role badge (filled ADMIN, neutral MOD,
 * outlined USER). Presentational; the role word is the accessible text.
 */
export function RolePill({ role, className }: { role: UserRole; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]",
        ROLE_PILL[role],
        className,
      )}
    >
      {role}
    </span>
  );
}
