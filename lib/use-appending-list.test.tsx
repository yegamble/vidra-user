// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveHasMore,
  useAppendingList,
  type AppendingPage,
  type UseAppendingListOptions,
} from "./use-appending-list";

type Row = { id: string };

/** A minimal surface over the hook: the rows, the flags, and the two verbs. */
function List(props: UseAppendingListOptions<Row>) {
  const list = useAppendingList<Row>(props);
  return (
    <div>
      <p data-testid="status">{list.status}</p>
      <p data-testid="rows">{list.items.map((r) => r.id).join(",")}</p>
      <p data-testid="total">{String(list.total)}</p>
      <p data-testid="lower-bound">{String(list.totalIsLowerBound)}</p>
      <p data-testid="has-more">{String(list.hasMore)}</p>
      <p data-testid="more-status">{list.moreStatus}</p>
      <button type="button" onClick={list.loadMore}>
        more
      </button>
      <button type="button" onClick={list.reload}>
        reload
      </button>
      <button type="button" onClick={() => list.drop((r) => r.id !== "a")}>
        drop a
      </button>
    </div>
  );
}

function rows(...ids: string[]): Row[] {
  return ids.map((id) => ({ id }));
}

const text = (id: string) => screen.getByTestId(id).textContent;

afterEach(cleanup);

describe("resolveHasMore", () => {
  it("believes the server's own answer above everything else", () => {
    // total says "plenty more" and the page is full; has_more is exact and wins.
    expect(
      resolveHasMore({ serverHasMore: false, total: 999, loaded: 20, pageLength: 20, pageSize: 20 }),
    ).toBe(false);
    expect(
      resolveHasMore({ serverHasMore: true, total: 1, loaded: 1, pageLength: 1, pageSize: 20 }),
    ).toBe(true);
  });

  it("falls back to counting against the total", () => {
    expect(resolveHasMore({ total: 42, loaded: 20, pageLength: 20, pageSize: 20 })).toBe(true);
    // The exactly-full LAST page: the short-page guess would leave a pager that
    // fetches nothing. The total knows better.
    expect(resolveHasMore({ total: 20, loaded: 20, pageLength: 20, pageSize: 20 })).toBe(false);
  });

  it("guesses from the page length only when the backend reports neither", () => {
    expect(resolveHasMore({ loaded: 20, pageLength: 20, pageSize: 20 })).toBe(true);
    expect(resolveHasMore({ loaded: 3, pageLength: 3, pageSize: 20 })).toBe(false);
  });
});

describe("useAppendingList", () => {
  it("loads a first page and reports the server's envelope", async () => {
    const load = vi.fn(async () => ({
      items: rows("a", "b"),
      total: 5,
      hasMore: true,
    }));

    render(<List queryKey="q1" load={load} />);

    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("rows")).toBe("a,b");
    expect(text("total")).toBe("5");
    expect(text("has-more")).toBe("true");
    expect(load).toHaveBeenCalledWith({ limit: 20, offset: 0 }, expect.anything());
  });

  it("appends the next page at the offset of what it already holds", async () => {
    const load = vi.fn(async ({ offset }: { offset: number }) =>
      offset === 0
        ? { items: rows("a", "b"), total: 3, hasMore: true }
        : { items: rows("c"), total: 3, hasMore: false },
    );

    render(<List queryKey="q1" load={load} />);
    await waitFor(() => expect(text("status")).toBe("ready"));
    act(() => screen.getByRole("button", { name: "more" }).click());

    await waitFor(() => expect(text("rows")).toBe("a,b,c"));
    expect(load).toHaveBeenLastCalledWith({ limit: 20, offset: 2 }, expect.anything());
    expect(text("has-more")).toBe("false");
  });

  it("carries a lower-bound total through, and never invents one", async () => {
    const withBound = vi.fn(async () => ({
      items: rows("a"),
      total: 1000,
      totalIsLowerBound: true,
    }));
    const { unmount } = render(<List queryKey="q1" load={withBound} />);
    await waitFor(() => expect(text("lower-bound")).toBe("true"));
    unmount();

    // An older backend reports no total at all: null, never 0.
    const bare = vi.fn(async () => ({ items: rows("a") }));
    render(<List queryKey="q2" load={bare} />);
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("total")).toBe("null");
    expect(text("lower-bound")).toBe("false");
  });

  it("resets to the first page when the query signature changes", async () => {
    const load = vi.fn(async () => ({ items: rows("a"), total: 1 }));
    const { rerender } = render(<List queryKey="q1" load={load} />);
    await waitFor(() => expect(text("status")).toBe("ready"));

    rerender(<List queryKey="q2" load={load} />);

    // The status flips on the SAME render as the key: no stale rows can sit
    // under the new filters while their refetch is in flight.
    expect(text("status")).toBe("loading");
    expect(text("rows")).toBe("");
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("drops a late page that belongs to a query nobody is looking at", async () => {
    let releaseSecondPage: (page: AppendingPage<Row>) => void = () => {};
    const load = vi.fn(({ offset }: { offset: number }) => {
      if (offset === 0) return Promise.resolve({ items: rows("a"), total: 9, hasMore: true });
      return new Promise<AppendingPage<Row>>((resolve) => {
        releaseSecondPage = resolve;
      });
    });

    const { rerender } = render(<List queryKey="q1" load={load} />);
    await waitFor(() => expect(text("status")).toBe("ready"));
    act(() => screen.getByRole("button", { name: "more" }).click());

    // The query moves on while page two is still in flight…
    rerender(<List queryKey="q2" load={load} />);
    await waitFor(() => expect(text("rows")).toBe("a"));
    await act(async () => {
      releaseSecondPage({ items: rows("stale"), total: 9 });
    });

    // …and its rows never appear under the new query's results.
    expect(text("rows")).not.toContain("stale");
  });

  it("holds an errored page in `error` and re-runs it on reload", async () => {
    const load = vi
      .fn<() => Promise<AppendingPage<Row>>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ items: rows("a"), total: 1 });

    render(<List queryKey="q1" load={load} />);
    await waitFor(() => expect(text("status")).toBe("error"));

    act(() => screen.getByRole("button", { name: "reload" }).click());
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("rows")).toBe("a");
  });

  it("reports a failed NEXT page without discarding the rows already read", async () => {
    const load = vi.fn(({ offset }: { offset: number }) =>
      offset === 0
        ? Promise.resolve({ items: rows("a"), total: 9, hasMore: true })
        : Promise.reject(new Error("boom")),
    );

    render(<List queryKey="q1" load={load} />);
    await waitFor(() => expect(text("status")).toBe("ready"));
    act(() => screen.getByRole("button", { name: "more" }).click());

    await waitFor(() => expect(text("more-status")).toBe("error"));
    expect(text("status")).toBe("ready");
    expect(text("rows")).toBe("a");
  });

  it("takes a dropped row off the total, because it really stopped existing", async () => {
    const load = vi.fn(async () => ({ items: rows("a", "b"), total: 2 }));
    render(<List queryKey="q1" load={load} />);
    await waitFor(() => expect(text("status")).toBe("ready"));

    act(() => screen.getByRole("button", { name: "drop a" }).click());

    expect(text("rows")).toBe("b");
    expect(text("total")).toBe("1");
  });

  it("hydrates from a server-fetched first page without re-fetching it", async () => {
    const load = vi.fn(async () => ({ items: rows("late"), total: 1 }));
    render(
      <List queryKey="q1" load={load} initialPage={{ items: rows("a", "b"), total: 2 }} />,
    );

    expect(text("status")).toBe("ready");
    expect(text("rows")).toBe("a,b");
    // 2 of 2 held: nothing to page to, and nothing was fetched.
    expect(text("has-more")).toBe("false");
    await waitFor(() => expect(load).not.toHaveBeenCalled());
  });

  it("retires the seed once the query moves, so returning to it still fetches", async () => {
    const load = vi.fn(async () => ({ items: rows("fetched"), total: 1 }));
    const { rerender } = render(
      <List queryKey="q1" load={load} initialPage={{ items: rows("seed"), total: 1 }} />,
    );
    expect(load).not.toHaveBeenCalled();

    rerender(<List queryKey="q2" load={load} initialPage={{ items: rows("seed"), total: 1 }} />);
    await waitFor(() => expect(text("rows")).toBe("fetched"));

    // Back to the original key: the seed is spent, so this must load rather
    // than sit in `loading` forever waiting for a page it will never request.
    rerender(<List queryKey="q1" load={load} initialPage={{ items: rows("seed"), total: 1 }} />);
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("rows")).toBe("fetched");
  });
});

describe("useAppendingList — holding a viewer-scoped list until the session settles", () => {
  const restoring = { settled: false, viewerKey: "anon" };
  const anon = { settled: true, viewerKey: "anon" };
  const authed = { settled: true, viewerKey: "authed:u-1" };

  it("issues no request while the session is still restoring", async () => {
    const load = vi.fn(async () => ({ items: rows("a") }) as AppendingPage<Row>);
    render(<List queryKey="q" viewer={restoring} load={load} />);
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("status").textContent).toBe("loading");
  });

  it("fetches exactly once when the session settles anonymous", async () => {
    const load = vi.fn(async () => ({ items: rows("a") }) as AppendingPage<Row>);
    const { rerender } = render(<List queryKey="q" viewer={restoring} load={load} />);
    await act(async () => {});
    rerender(<List queryKey="q" viewer={anon} load={load} />);
    await waitFor(() => expect(screen.getByTestId("rows").textContent).toBe("a"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fetches exactly once when the session settles signed in", async () => {
    const load = vi.fn(async () => ({ items: rows("a") }) as AppendingPage<Row>);
    const { rerender } = render(<List queryKey="q" viewer={restoring} load={load} />);
    await act(async () => {});
    rerender(<List queryKey="q" viewer={authed} load={load} />);
    await waitFor(() => expect(screen.getByTestId("rows").textContent).toBe("a"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a server-rendered seed for a visitor who settles anonymous, with NO request", async () => {
    const load = vi.fn(async () => ({ items: rows("z") }) as AppendingPage<Row>);
    const seed: AppendingPage<Row> = { items: rows("a", "b"), total: 2 };
    const { rerender } = render(
      <List queryKey="q" viewer={restoring} initialPage={seed} load={load} />,
    );
    expect(screen.getByTestId("rows").textContent).toBe("a,b");
    rerender(<List queryKey="q" viewer={anon} initialPage={seed} load={load} />);
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("rows").textContent).toBe("a,b");
  });

  it("replaces an anonymous seed with exactly one viewer-scoped request when the viewer signs in", async () => {
    const load = vi.fn(async () => ({ items: rows("z") }) as AppendingPage<Row>);
    const seed: AppendingPage<Row> = { items: rows("a", "b"), total: 2 };
    const { rerender } = render(
      <List queryKey="q" viewer={restoring} initialPage={seed} load={load} />,
    );
    rerender(<List queryKey="q" viewer={authed} initialPage={seed} load={load} />);
    await waitFor(() => expect(screen.getByTestId("rows").textContent).toBe("z"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retires an anonymous seed for a viewer who was ALREADY signed in at mount", async () => {
    // A client-side navigation mounts the list with the session already
    // settled. The seed is still the anonymous answer, so pinning it to the
    // mount-time key would leave a signed-in viewer looking at it forever.
    const load = vi.fn(async () => ({ items: rows("z") }) as AppendingPage<Row>);
    const seed: AppendingPage<Row> = { items: rows("a", "b"), total: 2 };
    render(<List queryKey="q" viewer={authed} initialPage={seed} load={load} />);
    await waitFor(() => expect(screen.getByTestId("rows").textContent).toBe("z"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("leaves lists with no viewer fetching on mount, exactly as before", async () => {
    const load = vi.fn(async () => ({ items: rows("a") }) as AppendingPage<Row>);
    render(<List queryKey="q" load={load} />);
    await waitFor(() => expect(screen.getByTestId("rows").textContent).toBe("a"));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
