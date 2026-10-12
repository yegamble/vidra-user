import { describe, expect, it, vi } from "vitest";

import { collectPages } from "./collect-pages";

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
});
