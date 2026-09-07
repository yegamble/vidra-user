import { afterEach, describe, expect, it, vi } from "vitest";

// clientIpForwardHeaders reads next/headers, which throws outside a request
// scope. Stub it so this stays a test of the knob — is the header attached at
// all — rather than of the extraction it already has its own tests for.
vi.mock("@/lib/client-ip.server", () => ({
  clientIpForwardHeaders: () => Promise.resolve({ "x-forwarded-for": "203.0.113.7" }),
}));

import { serverJson } from "./server-json";

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response | Promise<never>) {
  const fetchMock = vi.fn().mockReturnValue(Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("serverJson", () => {
  it("reads the path off the internal API base and parses the body", async () => {
    const fetchMock = stubFetch(okResponse({ name: "Vidra" }));
    const result = await serverJson<{ name: string }>("/api/v1/instance", {
      freshness: "no-store",
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/instance");
    expect((options.headers as Record<string, string>).Accept).toBe("application/json");
    expect(result).toEqual({ name: "Vidra" });
  });
});

describe("freshness", () => {
  it("no-store bypasses the Next data cache", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: "no-store" });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(options.cache).toBe("no-store");
    expect(options.next).toBeUndefined();
  });

  it("a revalidation window caches instead — the two are never both sent", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: { revalidateSeconds: 60 } });
    const [, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { next?: { revalidate: number } },
    ];
    expect(options.next).toEqual({ revalidate: 60 });
    expect(options.cache).toBeUndefined();
  });
});

describe("forwardClientIp", () => {
  it("bills the read to the viewer when asked", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: "no-store", forwardClientIp: true });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["x-forwarded-for"]).toBe("203.0.113.7");
  });

  it("stays off by default — a cached read must never carry a viewer's IP", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: { revalidateSeconds: 60 } });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["x-forwarded-for"]).toBeUndefined();
  });
});

describe("timeoutMs", () => {
  it("attaches an abort signal when a timeout is set", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: "no-store", timeoutMs: 5000 });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no signal when none is set — the site keeps the platform default", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: "no-store" });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeUndefined();
  });
});

describe("absence and failure all resolve, never throw", () => {
  it("a non-OK status is absence", async () => {
    stubFetch(okResponse({ error: "nope" }, 500));
    await expect(serverJson("/api/v1/instance", { freshness: "no-store" })).resolves.toBeNull();
  });

  it("a 404 is absence too, unless the caller says otherwise", async () => {
    stubFetch(okResponse({}, 404));
    await expect(serverJson("/api/v1/x", { freshness: "no-store" })).resolves.toBeNull();

    stubFetch(okResponse({}, 404));
    await expect(
      serverJson("/api/v1/x", { freshness: "no-store", on404: { body: "" } }),
    ).resolves.toEqual({ body: "" });
  });

  it("on404 does not swallow other failures", async () => {
    stubFetch(okResponse({}, 500));
    await expect(
      serverJson("/api/v1/x", { freshness: "no-store", on404: { body: "" } }),
    ).resolves.toBeNull();
  });

  it("an unreachable backend resolves to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(serverJson("/api/v1/instance", { freshness: "no-store" })).resolves.toBeNull();
  });

  it("a non-JSON body resolves to null rather than throwing into the render", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 200 })),
    );
    await expect(serverJson("/api/v1/instance", { freshness: "no-store" })).resolves.toBeNull();
  });
});

// A35 SC1. Every server-rendered read of vidra-core went out with NO
// X-Correlation-ID and no W3C traceparent — measured in the lab through a
// header tap in front of the api: `{"path":"/api/v1/instance","traceparent":
// null,"correlation":null}`. lib/api/client.ts has minted a correlation id per
// request since the observability spec landed; this second, older fetch path
// never grew one, so a server-rendered page and the backend requests it caused
// could not be joined by any id at all.
describe("correlation on a per-request read", () => {
  it("carries an X-Correlation-ID on an uncached read", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/videos/abc", { freshness: "no-store" });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["x-correlation-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("mints a fresh id per read, so two reads are told apart", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/videos/abc", { freshness: "no-store" });
    await serverJson("/api/v1/videos/def", { freshness: "no-store" });
    const first = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const second = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(first["x-correlation-id"]).not.toBe(second["x-correlation-id"]);
  });

  // The Next data cache keys on the request headers, so a per-request header on
  // a REVALIDATED read mints a cache entry per render — the same trap
  // lib/client-ip.server.ts's skip list already documents for the viewer IP.
  // A cached read also makes no backend request to correlate WITH.
  it("adds nothing per-request to a cached read", async () => {
    const fetchMock = stubFetch(okResponse({}));
    await serverJson("/api/v1/instance", { freshness: { revalidateSeconds: 60 } });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["x-correlation-id"]).toBeUndefined();
    expect(headers.traceparent).toBeUndefined();
    expect(Object.keys(headers)).toEqual(["Accept"]);
  });
});
