import { describe, expect, it, vi } from "vitest";

import { collectPages, DEFAULT_MAX_PAGES } from "./collect-pages";

describe("collectPages", () => {
  it("keeps asking at the advancing offset until the total is reached", async () => {
    const load = vi.fn(async ({ offset }: { limit: number; offset: number }) => ({
      items: Array.from({ length: Math.min(100, 230 - offset) }, (_, i) => offset + i),
      total: 230,
    }));
    const all = await collectPages(load);
    expect(all).toHaveLength(230);
    expect(load.mock.calls.map(([w]) => w)).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 100, offset: 200 },
    ]);
  });

  it("stops on a short page when the backend reports no total", async () => {
    const load = vi.fn(async () => ({ items: [1, 2, 3] }));
    expect(await collectPages(load)).toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("stops at maxPages and on an empty page", async () => {
    const endless = vi.fn(async () => ({ items: new Array(100).fill(0), total: 1e9 }));
    expect(await collectPages(endless, { maxPages: 3 })).toHaveLength(300);
    expect(await collectPages(async () => ({ items: [], total: 5 }))).toEqual([]);
  });

  it("stops an endless stream at the DEFAULT cap and reports the truncation", async () => {
    const endless = vi.fn(async () => ({ items: new Array(100).fill(0), total: 1e9 }));
    const onTruncated = vi.fn();
    const all = await collectPages(endless, { onTruncated });
    expect(DEFAULT_MAX_PAGES).toBe(50);
    expect(endless).toHaveBeenCalledTimes(DEFAULT_MAX_PAGES);
    expect(all).toHaveLength(DEFAULT_MAX_PAGES * 100);
    expect(onTruncated).toHaveBeenCalledTimes(1);
  });

  it("does not report truncation when the list completes", async () => {
    const onTruncated = vi.fn();
    await collectPages(async () => ({ items: [1, 2], total: 2 }), { onTruncated });
    expect(onTruncated).not.toHaveBeenCalled();
  });

  it("stops before the next page once the signal is aborted", async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => {
      controller.abort();
      return { items: new Array(100).fill(0), total: 1e9 };
    });
    await expect(collectPages(load, { signal: controller.signal })).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
