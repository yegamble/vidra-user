import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as embed } from "@/app/videos/embed/[id]/route";
import { GET as watch } from "@/app/videos/watch/[id]/route";
import { GET } from "./route";

const sid = "8uCPfDJ7ApQgMVqaKzEyPW";
const request = () => GET(new Request(`https://tube.example/w/${sid}`), { params: Promise.resolve({ sid }) });

afterEach(() => vi.unstubAllGlobals());

describe("upstream lookup on a legacy watch link", () => {
  it("preserves a rate limit and its retry interval without caching the response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "22" } }));
    vi.stubGlobal("fetch", fetch);
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("22");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => Promise.resolve(new Response(null, { status: 502 })),
    () => Promise.resolve(new Response("invalid JSON")),
    () => Promise.reject(new TypeError("upstream unavailable")),
  ])("reports a temporary backend failure", async (upstream) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(upstream));
    const response = await request();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.has("Location")).toBe(false);
  });

  it("passes a temporary failure through the UUID watch route without redirecting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const response = await watch(new Request("https://tube.example/videos/watch/example"), {
      params: Promise.resolve({ id: "example" }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.has("Location")).toBe(false);
  });

  it("stops an embed lookup on a rate limit without making a second request", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const response = await embed(new Request(`https://tube.example/videos/embed/${sid}`), {
      params: Promise.resolve({ id: sid }),
    });
    expect(response.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports an outage during the decoded embed lookup", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 })));
    const response = await embed(new Request(`https://tube.example/videos/embed/${sid}`), {
      params: Promise.resolve({ id: sid }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.has("Location")).toBe(false);
  });

  it.each([401, 403, 404])("keeps unavailable or private records hidden on %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    const response = await request();
    expect(response.status).toBe(404);
    expect(response.headers.has("Location")).toBe(false);
  });
});
