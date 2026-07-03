// Route-level loading boundary: a minimal skeleton shown while a route segment
// resolves. Views keep their own inline spinners for client-side fetches; this
// only covers the navigation gap before a page renders.
export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <span className="sr-only">Loading page…</span>
      <div aria-hidden className="h-8 w-48 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div aria-hidden className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-video animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </main>
  );
}
