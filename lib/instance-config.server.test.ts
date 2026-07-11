import { afterEach, describe, expect, it, vi } from "vitest";

import { getInstanceConfig } from "./instance-config.server";

// The SSR instance-config fetch must be unbreakable: any failure mode resolves
// to null (the layout seams then fall back to today's hardcoded behavior), and
// contract blocks are optional so a pre-W1 backend parses fine.

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("getInstanceConfig", () => {
  it("fetches GET /api/v1/instance and returns the parsed snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        name: "Vidra",
        federation_enabled: true,
        defaults: { theme: "dark" },
        customization: { css_hash: "abc123", js_hash: "" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getInstanceConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/instance$/);
    expect(snapshot?.name).toBe("Vidra");
    expect(snapshot?.defaults?.theme).toBe("dark");
    expect(snapshot?.customization?.css_hash).toBe("abc123");
  });

  it("tolerates a pre-W1 backend without the new blocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ name: "Vidra" })));
    const snapshot = await getInstanceConfig();
    expect(snapshot?.name).toBe("Vidra");
    expect(snapshot?.defaults).toBeUndefined();
    expect(snapshot?.broadcast).toBeUndefined();
    expect(snapshot?.branding).toBeUndefined();
  });

  it("resolves null when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(getInstanceConfig()).resolves.toBeNull();
  });

  it("resolves null on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(getInstanceConfig()).resolves.toBeNull();
  });

  it("resolves null on a non-JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })),
    );
    await expect(getInstanceConfig()).resolves.toBeNull();
  });
});
