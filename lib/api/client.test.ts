import {
  context,
  type Context,
  type ContextManager,
  propagation,
  ROOT_CONTEXT,
  trace,
  TraceFlags,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken, setSessionExpiredHandler } from "./auth-store";
import { ApiError, apiRequest, restoreSession } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REFRESH_URL = "http://localhost:8080/api/v1/auth/refresh";

function sessionJson(token: string): Response {
  // Cookie-mode AuthResponse: no refresh_token in the body.
  return jsonResponse({
    token,
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "ada",
      email: "ada@example.test",
      role: "user",
      email_verified: false,
      display_name: "",
      bio: "",
      created_at: "2026-01-01T00:00:00Z",
    },
  });
}

function unauthorized(): Response {
  return jsonResponse({ error: { code: "unauthorized", message: "token expired" } }, 401);
}

describe("apiRequest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the configured base URL and attaches a correlation id (no auth by default)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest("/api/v1/instance");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/instance");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.authorization).toBeUndefined();
  });

  it("sends a bearer token and JSON body when provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest("/x", { method: "POST", token: "secret", body: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret");
    expect(headers["content-type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.method).toBe("POST");
  });

  it("builds query strings and omits undefined params", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest("/api/v1/videos", {
      query: { sort: "popular", limit: 5, offset: undefined },
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:8080/api/v1/videos?sort=popular&limit=5");
  });

  it("returns the parsed body on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ name: "Vidra" }));
    const out = await apiRequest<{ name: string }>("/api/v1/instance");
    expect(out.name).toBe("Vidra");
  });

  it("maps the error envelope to ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "not_found", message: "video not found", request_id: "r1" } },
        404,
      ),
    );
    await expect(apiRequest("/api/v1/videos/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "not_found",
      message: "video not found",
      requestId: "r1",
    });
  });

  it("falls back to a generic ApiError for a non-envelope error body", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    const err = (await apiRequest("/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.code).toBe("http_error");
  });

  it("returns undefined on 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const out = await apiRequest("/x", { method: "DELETE" });
    expect(out).toBeUndefined();
  });

  it("returns undefined on a bodyless 202 (password-reset request)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    const out = await apiRequest("/x", { method: "POST", body: { a: 1 } });
    expect(out).toBeUndefined();
  });

  it("parses the body of a 202 that carries one (register pending approval)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "pending" }, 202));
    const out = await apiRequest<{ status: string }>("/x", { method: "POST", body: { a: 1 } });
    expect(out).toEqual({ status: "pending" });
  });

  it("wraps network failures as a network_error ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = (await apiRequest("/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("network_error");
    expect(err.status).toBe(0);
  });
});

// Minimal synchronous OTel context manager (see lib/observability/trace.test.ts)
// so context.with(...) makes a span active for the synchronous apiRequest call.
class SyncStackContextManager implements ContextManager {
  private active_: Context = ROOT_CONTEXT;
  active(): Context {
    return this.active_;
  }
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previous = this.active_;
    this.active_ = ctx;
    try {
      return fn.call(thisArg, ...args);
    } finally {
      this.active_ = previous;
    }
  }
  bind<T>(_ctx: Context, target: T): T {
    return target;
  }
  enable(): this {
    return this;
  }
  disable(): this {
    this.active_ = ROOT_CONTEXT;
    return this;
  }
}

describe("trace-context propagation to vidra-core", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
  const SPAN_ID = "b7ad6b7169203331";

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    propagation.disable();
    context.disable();
  });

  function headersOf(callIndex = 0): Record<string, string> {
    const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
    return init.headers as Record<string, string>;
  }

  it("sends X-Correlation-ID but no traceparent when OTel is off", async () => {
    await apiRequest("/api/v1/instance");
    const headers = headersOf();
    expect(headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.traceparent).toBeUndefined();
  });

  it("injects the active span's W3C traceparent (and keeps X-Correlation-ID) when OTel is on", async () => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    context.setGlobalContextManager(new SyncStackContextManager());

    const ctx = trace.setSpanContext(context.active(), {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    });
    await context.with(ctx, () => apiRequest("/api/v1/instance"));

    const headers = headersOf();
    expect(headers.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
    expect(headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("restoreSession", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it("POSTs the refresh endpoint with cookies, no body token, and stores the new access token", async () => {
    fetchMock.mockResolvedValue(sessionJson("fresh"));
    const res = await restoreSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(REFRESH_URL);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    // The httpOnly cookie is the sole refresh-token carrier — never a body token.
    expect(JSON.parse(init.body as string)).toEqual({ cookie_mode: true });
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(res?.token).toBe("fresh");
    expect(getAccessToken()).toBe("fresh");
  });

  it("resolves null on a dead/absent cookie (401) without throwing", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await expect(restoreSession()).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("resolves null on a network failure without throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(restoreSession()).resolves.toBeNull();
  });

  it("dedupes concurrent refreshes into a single flight", async () => {
    fetchMock.mockResolvedValue(sessionJson("fresh"));
    const [a, b] = await Promise.all([restoreSession(), restoreSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.token).toBe("fresh");
    expect(b?.token).toBe("fresh");
  });
});

describe("apiRequest 401 → silent refresh → retry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // Typed with its signature rather than a bare `vi.fn()`: an untyped mock is
  // `Mock<Constructable | Procedure>`, which setSessionExpiredHandler's
  // `(() => void) | null` parameter does not accept.
  let expired: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expired = vi.fn<() => void>();
    setSessionExpiredHandler(expired);
    setAccessToken("stale");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
    setAccessToken(null);
  });

  it("refreshes once and retries the original request with the rotated token", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized()) // original call, stale token
      .mockResolvedValueOnce(sessionJson("fresh")) // silent refresh
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // retried call
    const out = await apiRequest<{ ok: boolean }>("/api/v1/auth/me");
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshUrl).toBe(REFRESH_URL);
    expect(refreshInit.credentials).toBe("include");
    const [, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).authorization).toBe("Bearer fresh");
    expect(expired).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("fresh");
  });

  it("signs out and rethrows the original 401 when the refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized()) // original call
      .mockResolvedValueOnce(unauthorized()); // refresh: cookie dead too
    await expect(apiRequest("/api/v1/auth/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("signs out when the retried request is 401 again (no second refresh)", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized()) // original call
      .mockResolvedValueOnce(sessionJson("fresh")) // refresh succeeds
      .mockResolvedValueOnce(unauthorized()); // retry still unauthorized
    await expect(apiRequest("/api/v1/me/notifications")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("does not retry a call made with an explicit per-call token", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await expect(apiRequest("/x", { token: "explicit" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it("does not retry an anonymous call", async () => {
    setAccessToken(null);
    fetchMock.mockResolvedValue(unauthorized());
    await expect(apiRequest("/x")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it("does not retry when retryOn401 is false (session endpoints)", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await expect(apiRequest("/api/v1/auth/login", { method: "POST", body: {}, retryOn401: false })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it("does not retry non-401 failures", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "forbidden", message: "no" } }, 403),
    );
    await expect(apiRequest("/x")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
