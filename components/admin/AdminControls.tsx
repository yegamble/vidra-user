"use client";

import { useId, type FormEvent } from "react";

import { SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
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
 * The page sizes the admin pager offers. Bounded by the backend's list contract
 * (any `limit` in [1,100]); 10 is the app-wide default a list opens on
 * (`DEFAULT_LIMIT` in lib/use-list-query.ts).
 */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

/**
 * AdminPagination — the admin surfaces' limit/offset pager: a `start–end of
 * total` + `Page X of Y` readout on the left, an optional rows-per-page picker
 * and Previous / Next on the right.
 *
 * It needs a real `total` from the endpoint. Without one a client cannot tell a
 * last page from a truncated one, which is the difference between "that is
 * everybody" and "there are 4,549 more" — so a surface whose contract carries no
 * total must not fake this control.
 *
 * Visibility has two modes, deliberately:
 *  - **without `onPageSize`** (the historical call sites) it renders nothing
 *    when the whole result set already fits on the first page, so a small list
 *    never sees pagination chrome it has no use for;
 *  - **with `onPageSize`** it renders whenever there is at least one row. A
 *    seven-row list still reads "1–7 of 7" and still lets you change the page
 *    size — hiding the control would strand the only way to change it.
 *
 * `label` names the rows for the nav's accessible name ("Paginate users").
 */
export function AdminPagination({
  total,
  limit,
  offset,
  onOffset,
  label,
  pageSize,
  onPageSize,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (offset: number) => void;
  label: string;
  /**
   * The selected page size. Defaults to `limit` — pass it explicitly only when
   * the pending selection differs from the limit the current rows were fetched
   * with (e.g. a request in flight). A value outside `PAGE_SIZE_OPTIONS` is
   * offered as an extra option so the picker never lies about the current size.
   */
  pageSize?: number;
  /**
   * Called with the chosen page size. Omit it to leave the picker out entirely
   * — the four historical call sites do, and keep their old behaviour.
   */
  onPageSize?: (pageSize: number) => void;
}) {
  const sizeLabelId = useId();
  if (!onPageSize && total <= limit && offset === 0) return null;
  if (onPageSize && total === 0) return null;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  // Guard against a zero/negative limit reaching us from a bad query string:
  // Math.ceil(n/0) is Infinity and would render "Page 1 of Infinity".
  const perPage = limit > 0 ? limit : 1;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pageCount, Math.floor(offset / perPage) + 1);
  const selectedSize = pageSize ?? limit;
  const sizes: number[] = PAGE_SIZE_OPTIONS.some((size) => size === selectedSize)
    ? [...PAGE_SIZE_OPTIONS]
    : [...PAGE_SIZE_OPTIONS, selectedSize].sort((a, b) => a - b);
  return (
    <nav
      aria-label={`Paginate ${label}`}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs tabular-nums text-fg-muted">
          {start}–{end} of {total}
        </span>
        <span className="text-xs tabular-nums text-fg-muted">
          Page {page} of {pageCount}
        </span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSize ? (
          <div className="flex items-center gap-2">
            <span id={sizeLabelId} className="text-xs text-fg-muted">
              Rows per page
            </span>
            {/* Fixed-width wrapper rather than a width utility on the Select:
                `cn()` is a plain concat (no tailwind-merge), so a competing
                `w-*` would resolve by stylesheet order, not by our order. */}
            <div className="w-24">
              <Select
                aria-labelledby={sizeLabelId}
                value={selectedSize}
                onChange={(e) => onPageSize(Number(e.target.value))}
              >
                {sizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
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
