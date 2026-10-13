import { describe, expect, it } from "vitest";

import { GET } from "./route";

const call = (id: string, qs = "") =>
  GET(new Request(`https://tube.example/video-playlists/embed/${id}${qs}`) as unknown as Parameters<typeof GET>[0], {
    params: Promise.resolve({ id }),
  });

describe("GET /video-playlists/embed/[id]", () => {
  it("redirects to /embed/playlists/{id}, mapping start to t and carrying embed options and playlistPosition", async () => {
    const res = await call("abc-123", "?start=90&autoplay=1&playlistPosition=3&junk=1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/embed/playlists/abc-123?t=90&autoplay=1&playlistPosition=3");
  });

  it("drops a non-word-shaped value and encodes the id", async () => {
    const res = await call("a b", "?playlistPosition=<x>");
    expect(res.headers.get("location")).toBe("/embed/playlists/a%20b");
  });
});
