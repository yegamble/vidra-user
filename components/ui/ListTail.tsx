"use client";

import { LoadMoreButton, LoadMoreSentinel } from "@/components/ui/LoadMoreButton";
import { shouldRenderLoadMore, useAutoLoad } from "@/lib/use-auto-load";

export type ListTailProps = {
  /** Whether another page exists. Nothing renders when it does not. */
  hasMore: boolean;
  /** Whether the operator turned infinite scroll on (`browse_scroll_mode`). */
  autoLoad: boolean;
  /** Whether a page is already in flight. */
  busy: boolean;
  /** The last page error, if any — shown on the button, which is the retry. */
  error?: string | null;
  onLoadMore: () => void;
};

/**
 * ListTail — what goes after the last row of a "Load more" list: the auto-load
 * sentinel, then the manual button.
 *
 * Both, never one. A scroll sentinel is invisible to a keyboard or
 * screen-reader user, so the button keeps rendering whenever auto-load is off
 * OR the last automatic page failed (an errored sentinel would otherwise retry
 * itself into a loop, and there would be nothing left to click). That rule is
 * `shouldRenderLoadMore`; this component is where the four browse lists share
 * it instead of each remembering it.
 *
 * It exists as a component rather than as part of `useAppendingList` because
 * the sentinel ref belongs to the element that mounts it: a hook handing a ref
 * back inside its result object makes every read of that object a ref access
 * during render.
 */
export function ListTail({ hasMore, autoLoad, busy, error = null, onLoadMore }: ListTailProps) {
  const sentinelRef = useAutoLoad({ enabled: autoLoad, hasMore, busy, onLoadMore });
  if (!hasMore) return null;
  return (
    <>
      <LoadMoreSentinel ref={sentinelRef} />
      {shouldRenderLoadMore({ hasMore, autoLoad, error }) ? (
        <LoadMoreButton busy={busy} error={error} onClick={onLoadMore} />
      ) : null}
    </>
  );
}
