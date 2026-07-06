/**
 * The page size the paginated grids request (server limit/offset paging) or
 * reveal (client-side chunking) per "Load more" click. Matches the backend's
 * default feed/search limit of 20.
 */
export const PAGE_SIZE = 20;

// LoadMoreButton is the shared pager control under the video grids. The parent
// hides it when the last page came back short (no more items); while a page is
// in flight the button disables and reads "Loading more…"; a failed page keeps
// the button (so the click can be retried) and announces the error inline.
export function LoadMoreButton({
  busy = false,
  error = null,
  onClick,
}: {
  busy?: boolean;
  error?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="focus-ring rounded-full border border-border px-5 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        {busy ? "Loading more…" : "Load more"}
      </button>
    </div>
  );
}
