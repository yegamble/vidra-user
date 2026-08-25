// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same navigation stub as use-list-query.test.tsx: `replace` writes back into
// the params the hook reads, so a setter really does change the next render.
const replace = vi.fn((url: string) => {
  nav.params = new URLSearchParams(url.split("?")[1] ?? "");
});
const nav = { pathname: "/moderation/videos", params: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

import type { ListQueryState } from "./use-list-query";
import { usePagedList, type ListPage } from "./use-paged-list";

type Row = { id: string };

function page(items: Row[], overrides: Partial<ListPage<Row>> = {}): ListPage<Row> {
  return { items, total: 200, limit: 20, offset: 0, ...overrides };
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  replace.mockClear();
});

afterEach(cleanup);

describe("usePagedList", () => {
  it("reports the server's total and window, not the page length", async () => {
    const load = vi.fn(async () => page([{ id: "a" }, { id: "b" }], { total: 4649, limit: 20 }));
    const { result } = renderHook(() => usePagedList<Row>({ load }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(2);
    // The bug this hook exists to kill: 4649, never 2.
    expect(result.current.total).toBe(4649);
    expect(result.current.pageLimit).toBe(20);
  });

  it("believes the server's clamped limit over the one it asked for", async () => {
    nav.params = new URLSearchParams("limit=100");
    const load = vi.fn(async () => page([], { limit: 50, offset: 0 }));
    const { result } = renderHook(() => usePagedList<Row>({ load }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.limit).toBe(100); // what we asked for
    expect(result.current.pageLimit).toBe(50); // what the pager must size on
  });

  it("sends the current window and filters to `load`", async () => {
    nav.params = new URLSearchParams("limit=50&offset=100&sort=-views&state=failed");
    const load = vi.fn<(q: ListQueryState, s: AbortSignal) => Promise<ListPage<Row>>>(async () =>
      page([]),
    );
    const { result } = renderHook(() =>
      usePagedList<Row>({ load, filterKeys: ["state"], defaultSort: "-created_at" }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(load.mock.calls[0][0]).toEqual({
      limit: 50,
      offset: 100,
      sort: "-views",
      filters: { state: "failed" },
    });
  });

  it("refetches on a window move, with no stale page flashing under it", async () => {
    // The second request is left pending so the in-flight state is observable.
    let release: ((p: ListPage<Row>) => void) | null = null;
    const load = vi
      .fn<(q: unknown, s: AbortSignal) => Promise<ListPage<Row>>>()
      .mockResolvedValueOnce(page([{ id: "a" }]))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const { result, rerender } = renderHook(() => usePagedList<Row>({ load }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.setOffset(20);
    });
    // The stubbed router mutates `nav.params` without telling React, which the
    // real `router.replace` would; `rerender` stands in for that re-render.
    rerender();
    // Derived status: the page-1 rows cannot show under a page-2 window.
    expect(result.current.status).toBe("loading");
    expect(result.current.items).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0]).toMatchObject({ offset: 20 });

    await act(async () => {
      release?.(page([{ id: "b" }], { offset: 20 }));
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.items).toEqual([{ id: "b" }]);
  });

  it("surfaces a failed fetch as error and recovers on reload", async () => {
    const load = vi
      .fn<() => Promise<ListPage<Row>>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(page([{ id: "a" }]));
    const { result } = renderHook(() => usePagedList<Row>({ load }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toEqual([{ id: "a" }]);
  });

  it("does not adopt a page whose request was aborted", async () => {
    const load = vi.fn(
      (_query, signal: AbortSignal) =>
        new Promise<ListPage<Row>>((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
          setTimeout(() => resolve(page([{ id: "slow" }])), 0);
        }),
    );
    const { result, unmount } = renderHook(() => usePagedList<Row>({ load }));
    unmount();
    await new Promise((r) => setTimeout(r, 5));
    expect(result.current.status).toBe("loading");
  });

  it("patches a row in place without touching the total", async () => {
    const load = vi.fn(async () => page([{ id: "a" }, { id: "b" }], { total: 7 }));
    const { result } = renderHook(() => usePagedList<Row>({ load }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.patch((items) => items.map((i) => (i.id === "a" ? { id: "a2" } : i))));
    expect(result.current.items).toEqual([{ id: "a2" }, { id: "b" }]);
    expect(result.current.total).toBe(7);
  });

  it("drops a deleted row off the total too", async () => {
    const load = vi.fn(async () => page([{ id: "a" }, { id: "b" }], { total: 7 }));
    const { result } = renderHook(() => usePagedList<Row>({ load }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.drop((item) => item.id !== "a"));
    expect(result.current.items).toEqual([{ id: "b" }]);
    // A row that stopped existing must stop being counted, or the pager keeps
    // promising a page that is not there.
    expect(result.current.total).toBe(6);
  });

  it("prepends a created row and counts it", async () => {
    const load = vi.fn(async () => page([{ id: "a" }], { total: 1 }));
    const { result } = renderHook(() => usePagedList<Row>({ load }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.prepend({ id: "new" }));
    expect(result.current.items).toEqual([{ id: "new" }, { id: "a" }]);
    expect(result.current.total).toBe(2);
  });

  it("does not refetch when only the `load` identity changes", async () => {
    const calls: number[] = [];
    let n = 0;
    const { rerender, result } = renderHook(() =>
      // A fresh closure every render — the trap that would loop forever if
      // `load` were an effect dependency.
      usePagedList<Row>({
        load: async () => {
          calls.push(++n);
          return page([]);
        },
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toHaveLength(1);
  });
});
