import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicFeed } from "./feed.server";

afterEach(() => vi.unstubAllGlobals());

describe("getPublicFeed", () => {
  it("fetches the exact first-page filters without caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          videos: [{ id: "v1" }],
          sort: "popular",
          scope: "all",
          limit: 20,
          offset: 0,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublicFeed({
      sort: "popular",
      scope: "all",
      tag: "cats & dogs",
      category: "7",
      language: "en",
      limit: 20,
      offset: 0,
    });

    const [url, options] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/api/v1/videos");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      sort: "popular",
      scope: "all",
      tag: "cats & dogs",
      category: "7",
      language: "en",
      limit: "20",
      offset: "0",
    });
    expect(options).toMatchObject({ cache: "no-store" });
    expect(result?.videos).toHaveLength(1);
  });

  it("returns null so the browser fallback can recover from a server read failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend down")));
    await expect(getPublicFeed({ sort: "recent", limit: 20, offset: 0 })).resolves.toBeNull();
  });
});
