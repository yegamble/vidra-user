import { Suspense, type ReactNode } from "react";

import { Spinner } from "@/components/ui/Spinner";

/**
 * ListBoundary — the `<Suspense>` boundary every `usePagedList` surface needs.
 *
 * `useListQuery` reads `useSearchParams()`, and Next refuses to statically
 * render a route that calls it outside a Suspense boundary: without one, `next
 * build` fails the whole page rather than degrading. Since the list state lives
 * in the URL by design, that boundary is a structural requirement of the
 * pattern, not a per-route detail — so it ships with the pattern and the route
 * files stay untouched.
 *
 * The fallback is the same centred spinner the list itself shows while
 * fetching, so the hand-off from "resolving the query string" to "fetching the
 * first page" is invisible.
 */
export function ListBoundary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Spinner label={`Loading ${label}`} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
