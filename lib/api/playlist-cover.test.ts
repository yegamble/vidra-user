import { afterEach, expect, it, vi } from "vitest";
import { api } from "./endpoints";
import { setAccessToken } from "./auth-store";
afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });
it("fetches private cover bytes with the current bearer and cancellation", async () => {
  setAccessToken("test-token");
  const fetch = vi.fn().mockResolvedValue(new Response("png", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await (await api.fetchPlaylistThumbnail("p/1", signal)).text()).toBe("png");
  expect(fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/playlists/p%2F1/thumbnail", {
    headers: { authorization: "Bearer test-token" }, signal,
  });
});
it("preserves denial as an error instead of image bytes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
  await expect(api.fetchPlaylistThumbnail("private")).rejects.toMatchObject({ status: 404 });
});
