import { Skeleton } from "@/components/ui";

// Route-level loading boundary: a minimal skeleton shown while a route segment
// resolves. Views keep their own inline spinners for client-side fetches; this
// only covers the navigation gap before a page renders.
export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-48 rounded-full" />
      <div aria-hidden className="mt-6 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-video rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </main>
  );
}
