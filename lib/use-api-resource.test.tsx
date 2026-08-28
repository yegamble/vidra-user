// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useApiResource } from "./use-api-resource";

afterEach(cleanup);

type Row = { id: string };

describe("useApiResource", () => {
  it("starts loading and settles on the loaded value", async () => {
    const load = vi.fn(async () => [{ id: "a" }] as Row[]);
    const { result } = renderHook(() => useApiResource(load));

    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual([{ id: "a" }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected request as an error", async () => {
    const load = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useApiResource(load));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBeNull();
  });

  // A `load` that decides the request is unsendable can just throw; that must
  // land in the error state rather than escaping the effect and crashing.
  it("catches a synchronous throw from load", async () => {
    const { result } = renderHook(() =>
      useApiResource(() => {
        throw new Error("unsendable");
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("passes an abort signal and aborts it on unmount", async () => {
    let signal: AbortSignal | undefined;
    const load = vi.fn(async (s: AbortSignal) => {
      signal = s;
      return [] as Row[];
    });
    const { unmount, result } = renderHook(() => useApiResource(load));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  // The whole reason this hook exists: a request aborted by an unmount or a dep
  // change still rejects, and a copy that forgot the guard painted "Could not
  // load" over a surface nobody was looking at any more.
  it("does not report an error for a request that was aborted", async () => {
    let reject: (err: unknown) => void = () => {};
    const load = vi.fn(
      (s: AbortSignal) =>
        new Promise<Row[]>((_, rej) => {
          reject = rej;
          s.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    );
    const { result, rerender } = renderHook(({ dep }) => useApiResource(load, [dep]), {
      initialProps: { dep: 1 },
    });

    // Changing the dep aborts the first request; its rejection arrives after.
    rerender({ dep: 2 });
    await act(async () => {
      reject(new Error("late"));
      await Promise.resolve();
    });
    expect(result.current.status).toBe("loading");
  });

  it("refetches when a dep changes, and re-opens the loading state", async () => {
    const load = vi.fn(async () => [] as Row[]);
    const { result, rerender } = renderHook(({ dep }) => useApiResource(load, [dep]), {
      initialProps: { dep: "a" },
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ dep: "b" });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not refetch when nothing changed", async () => {
    const load = vi.fn(async () => [] as Row[]);
    const { result, rerender } = renderHook(({ dep }) => useApiResource(load, [dep]), {
      initialProps: { dep: "a" },
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ dep: "a" });
    rerender({ dep: "a" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-reads a fresh load closure without needing it memoised", async () => {
    let value = "first";
    const { result, rerender } = renderHook(() => useApiResource(async () => value));

    await waitFor(() => expect(result.current.data).toBe("first"));
    value = "second";
    rerender();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).toBe("second"));
  });

  it("retries after a failure", async () => {
    const load = vi
      .fn<() => Promise<Row[]>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{ id: "a" }]);
    const { result } = renderHook(() => useApiResource(load));

    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual([{ id: "a" }]);
  });

  it("lets a caller rewrite the loaded value optimistically", async () => {
    const load = vi.fn(async () => [{ id: "a" }, { id: "b" }] as Row[]);
    const { result } = renderHook(() => useApiResource(load));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setData((prev) => (prev ?? []).filter((r) => r.id !== "a")));
    expect(result.current.data).toEqual([{ id: "b" }]);
    // An optimistic edit is not a refetch.
    expect(load).toHaveBeenCalledTimes(1);
  });
});
