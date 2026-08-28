"use client";

import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";

export interface ManagedListProps<T> {
  /** Fetch the whole list. Held in a ref by `useApiResource`; needs no memoising. */
  load: (signal: AbortSignal) => Promise<T[]>;
  /** Stable identity for a row — also the value `remove` matches on. */
  rowKey: (item: T) => string;
  /** Spinner label, e.g. "Loading blocked accounts". */
  loadingLabel: string;
  /** ErrorState copy, e.g. "Could not load your blocked accounts." */
  errorText: string;
  /** What to show when the list loads empty — an `EmptyState`. */
  empty: ReactNode;
  /**
   * Render one row. `remove` drops it from the list optimistically, which is
   * what every one of these surfaces does after its undo action succeeds.
   */
  renderRow: (item: T, remove: () => void) => ReactNode;
}

/**
 * ManagedList — the "things you have blocked or muted, with an undo" surface.
 *
 * The blocked-accounts, muted-accounts and muted-instances views were
 * line-for-line clones: a full-list fetch, the loading/error/empty triad, a
 * `<ul>` of rounded rows, and a per-row action that removes the row on success.
 * A diff of any two of them changed only identifiers and copy strings.
 *
 * Deliberately not generalised past that: paginated moderation tables belong to
 * `usePagedList`, and a list whose rows survive their action (a status flip
 * rather than a removal) is a different component.
 */
export function ManagedList<T>({
  load,
  rowKey,
  loadingLabel,
  errorText,
  empty,
  renderRow,
}: ManagedListProps<T>) {
  const { status, data, retry, setData } = useApiResource<T[]>(load);

  const remove = useCallback(
    (key: string) => setData((prev) => (prev ?? []).filter((item) => rowKey(item) !== key)),
    // `rowKey` is an inline arrow at every call site, so depending on its
    // identity would rebuild this callback every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setData],
  );

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={loadingLabel} />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message={errorText} onRetry={retry} />;
  }

  const items = data ?? [];
  if (items.length === 0) return <>{empty}</>;

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const key = rowKey(item);
        return <li key={key}>{renderRow(item, () => remove(key))}</li>;
      })}
    </ul>
  );
}

export interface UndoActionRowProps {
  /** Primary line — the account name, the instance domain. */
  title: ReactNode;
  /** Muted second line, e.g. "@ada · blocked 3 days ago". */
  subtitle: ReactNode;
  /** Visible button text: "Unblock", "Unmute". */
  action: string;
  /**
   * Accessible name for the button when the visible text alone is ambiguous —
   * a column of identical "Unmute" buttons reads as nothing without it.
   */
  actionLabel?: string;
  /** Perform the undo. Rejecting leaves the row in place under an inline error. */
  perform: () => Promise<unknown>;
  /** Fallback copy if the failure carries no message of its own. */
  failureText: string;
  /** Called once `perform` resolves — normally `ManagedList`'s `remove`. */
  onDone: () => void;
}

/**
 * UndoActionRow — one row of a `ManagedList`: an identity, a timestamp, and a
 * single button that undoes whatever put the row there.
 *
 * The row stays put while the request is in flight and on failure (with the
 * reason inline); only success removes it. Re-entrancy is blocked by `busy`, so
 * a double-click cannot fire two unblocks.
 */
export function UndoActionRow({
  title,
  subtitle,
  action,
  actionLabel,
  perform,
  failureText,
  onDone,
}: UndoActionRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await perform();
      onDone();
    } catch (err) {
      setError(errorMessage(err, failureText));
      // Only reset on failure: on success the row unmounts.
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">{title}</p>
        <p className="text-[13px] text-fg-muted">{subtitle}</p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={busy}
        aria-label={actionLabel}
        onClick={() => void run()}
      >
        {action}
      </Button>
    </div>
  );
}
