import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPublicVideo,
  getPublicVideoByCode,
  getPublicVideoByLegacyUUID,
} from "./video.server";

// The server-rendered watch document must never be cached across requests.
//
// It used to read with `next: { revalidate: 60 }`, accepting "watch metadata may
// lag a title edit by up to a minute". Applied to a MODERATION hide that is not
// a lag at all: Next's data cache does not replace a cached successful body with
// a FAILED revalidation, so once a video is blocked (or made private, or
// deleted) the last good copy is served indefinitely — A16 slice 2 measured a
// blocked video's title, og:*, <h1> and whole serialized document coming back
// for 30 requests over 175 seconds while GET /api/v1/videos/{id} answered 404 to
// the same anonymous caller throughout. The window length was never the
// variable: any window leaks forever once the revalidation starts failing.
//
// These tests pin the request options, because that is where the bug lived — the
// body of the function was always right.

afterEach(() => {
  vi.unstubAllGlobals();
});

function fetchSpy() {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "v1", title: "Clip" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function initOf(spy: ReturnType<typeof fetchSpy>): RequestInit & { next?: unknown } {
  const call = spy.mock.calls[0] as [string, RequestInit & { next?: unknown }];
  return call[1];
}

describe("the public watch document reads", () => {
  it("reads a video by id uncached, so a block cannot be served from a stale entry", async () => {
    const spy = fetchSpy();
    await getPublicVideo("11111111-1111-4111-8111-111111111111");
    const init = initOf(spy);
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("reads a video by short code uncached", async () => {
    const spy = fetchSpy();
    await getPublicVideoByCode("abcdefghijk");
    const init = initOf(spy);
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("resolves a legacy uuid uncached, so a deleted video stops redirecting", async () => {
    const spy = fetchSpy();
    await getPublicVideoByLegacyUUID("22222222-2222-4222-8222-222222222222");
    const init = initOf(spy);
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("still resolves null when the video is gone, rather than reusing a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(getPublicVideo("33333333-3333-4333-8333-333333333333")).resolves.toBeNull();
  });
});
