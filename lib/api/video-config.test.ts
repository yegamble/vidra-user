import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getVideoConfigCached,
  resetVideoConfigCacheForTests,
  resolveOptionLabel,
} from "./video-config";

const CONFIG = {
  categories: [{ id: "music", label: "Music" }],
  licenses: [{ id: "cc-by", label: "CC BY" }],
  languages: [{ id: "en", label: "English" }],
  privacies: [{ id: "public", label: "Public" }],
};

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("getVideoConfigCached", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetVideoConfigCacheForTests();
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okJson(CONFIG)));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    resetVideoConfigCacheForTests();
    vi.unstubAllGlobals();
  });

  it("fetches the taxonomy once, even across concurrent callers", async () => {
    const [a, b] = await Promise.all([getVideoConfigCached(), getVideoConfigCached()]);
    expect(a).toEqual(CONFIG);
    expect(b).toEqual(CONFIG);
    await getVideoConfigCached(); // a later caller reuses the settled promise
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://localhost:8080/api/v1/videos/config",
    );
  });

  it("clears the cache on failure so the next caller retries", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    await expect(getVideoConfigCached()).rejects.toThrow("could not reach the server");
    await expect(getVideoConfigCached()).resolves.toEqual(CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolveOptionLabel", () => {
  it("maps a taxonomy id to its label", () => {
    expect(resolveOptionLabel(CONFIG.categories, "music")).toBe("Music");
    expect(resolveOptionLabel(CONFIG.licenses, "cc-by")).toBe("CC BY");
  });

  it("falls back to the raw id when options are missing or the id is unknown", () => {
    expect(resolveOptionLabel(undefined, "music")).toBe("music");
    expect(resolveOptionLabel(CONFIG.categories, "sports")).toBe("sports");
    expect(resolveOptionLabel([], "music")).toBe("music");
  });
});
