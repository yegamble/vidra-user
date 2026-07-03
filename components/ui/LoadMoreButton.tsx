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
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {busy ? "Loading more…" : "Load more"}
      </button>
    </div>
  );
}
