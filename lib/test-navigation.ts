import { useSyncExternalStore } from "react";

/**
 * TEST-ONLY stub for `next/navigation`.
 *
 * Now that list state lives in the URL, an admin view refetches because
 * `router.replace` changes what `useSearchParams` returns — so a stub whose
 * `replace` merely records the call proves nothing: the component never
 * re-renders and the "did paging refetch" assertion measures the stub.
 *
 * This one closes the loop. Navigations write to a module-level store and
 * notify subscribers, and the hooks read it through `useSyncExternalStore`, so
 * a click really does drive a re-render with the new query string, exactly as
 * the App Router would.
 *
 * Use it from a `vi.mock` factory (which is hoisted, hence the dynamic import):
 *
 * ```ts
 * vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
 * import { navigation } from "@/lib/test-navigation";
 *
 * beforeEach(() => navigation.reset("/admin/users"));
 * ```
 */

const listeners = new Set<() => void>();
const state = { pathname: "/", search: "" };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function navigate(url: string, record: string[]): void {
  record.push(url);
  const [pathname, search = ""] = url.split("?");
  state.pathname = pathname;
  state.search = search;
  for (const listener of listeners) listener();
}

export const navigation = {
  /** Every URL passed to `router.replace`, oldest first. */
  replaced: [] as string[],
  /** Every URL passed to `router.push`, oldest first. */
  pushed: [] as string[],
  /** Point the stub at a starting URL and forget the recorded navigations. */
  reset(pathname = "/", search = "") {
    state.pathname = pathname;
    state.search = search;
    navigation.replaced.length = 0;
    navigation.pushed.length = 0;
  },
  /** The query string currently in the stubbed URL. */
  params(): URLSearchParams {
    return new URLSearchParams(state.search);
  },
  /** The URL of the most recent navigation, or "" if there has been none. */
  lastUrl(): string {
    return navigation.replaced.at(-1) ?? navigation.pushed.at(-1) ?? "";
  },
};

const router = {
  replace: (url: string) => navigate(url, navigation.replaced),
  push: (url: string) => navigate(url, navigation.pushed),
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};

export const navigationMock = {
  useRouter: () => router,
  usePathname: () =>
    useSyncExternalStore(
      subscribe,
      () => state.pathname,
      () => state.pathname,
    ),
  useSearchParams: () =>
    new URLSearchParams(
      useSyncExternalStore(
        subscribe,
        () => state.search,
        () => state.search,
      ),
    ),
};
