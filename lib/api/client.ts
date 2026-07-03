import { apiBaseUrl } from "@/lib/config";
import { logger } from "@/lib/logger";

import { getAccessToken, notifySessionExpired, setAccessToken } from "./auth-store";
import type { ApiErrorEnvelope, AuthResponse, FieldError, RefreshRequest } from "./types";

/**
 * ApiError is thrown for any non-2xx response. It carries the backend's stable
 * error `code`, the HTTP `status`, the correlating `request_id`, and field-level
 * validation problems (on 422). Callers branch on `code`/`status`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly fields?: FieldError[];

  constructor(args: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    fields?: FieldError[];
  }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.requestId = args.requestId;
    this.fields = args.fields;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Bearer token for authenticated calls. Never logged. */
  token?: string;
  signal?: AbortSignal;
  /**
   * Cookie policy for the request. ONLY the auth endpoints that manage the
   * httpOnly `vidra_refresh` cookie (register/login/refresh/logout) pass
   * "include"; every other call stays cookie-free so credentials are never
   * sent where they are not needed.
   */
  credentials?: RequestCredentials;
  /**
   * Set false to opt out of the automatic silent-refresh-and-retry on 401.
   * Used by the session-management endpoints themselves (login/register/
   * refresh/logout), where a 401 is a real answer, never a stale access token.
   */
  retryOn401?: boolean;
}

const REFRESH_PATH = "/api/v1/auth/refresh";

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(apiBaseUrl + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * apiErrorFromBody maps a backend error envelope (raw response text) + HTTP
 * status to an ApiError. Shared by the fetch client (below) and the XHR upload
 * path (upload.ts) so both transports surface identical errors.
 */
export function apiErrorFromBody(status: number, text: string): ApiError {
  let code = "http_error";
  let message = `request failed with status ${status}`;
  let requestId: string | undefined;
  let fields: FieldError[] | undefined;
  try {
    const body = JSON.parse(text) as Partial<ApiErrorEnvelope>;
    if (body.error) {
      code = body.error.code || code;
      message = body.error.message || message;
      requestId = body.error.request_id;
      fields = body.error.fields;
    }
  } catch {
    // Non-JSON or empty body — keep the generic message.
  }
  return new ApiError({ status, code, message, requestId, fields });
}

async function toApiError(res: Response): Promise<ApiError> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    // An unreadable body — keep the generic message.
  }
  return apiErrorFromBody(res.status, text);
}

// doRequest performs one HTTP round trip (no retry logic) with the given
// bearer token (null = anonymous). See apiRequest for the public wrapper.
async function doRequest<T>(
  path: string,
  opts: RequestOptions,
  token: string | null,
): Promise<T> {
  const method = opts.method ?? "GET";
  const url = buildUrl(path, opts.query);
  const correlationId = crypto.randomUUID();

  // A FormData body is a multipart upload: let the browser set the
  // content-type (with its boundary) and send it as-is, no JSON encoding.
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;

  const headers: Record<string, string> = {
    accept: "application/json",
    "x-correlation-id": correlationId,
  };
  if (opts.body !== undefined && !isForm) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body:
        opts.body === undefined
          ? undefined
          : isForm
            ? (opts.body as FormData)
            : JSON.stringify(opts.body),
      signal: opts.signal,
      ...(opts.credentials ? { credentials: opts.credentials } : {}),
    });
  } catch (cause) {
    logger.error("api request network error", {
      method,
      path,
      correlation_id: correlationId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: "could not reach the server",
    });
  }

  if (!res.ok) {
    const err = await toApiError(res);
    logger.warn("api request failed", {
      method,
      path,
      status: err.status,
      error_code: err.code,
      correlation_id: correlationId,
      request_id: err.requestId,
    });
    throw err;
  }

  // 204 No Content never carries a body. A 202 Accepted may (register →
  // {status:"pending"} when the instance requires approval) or may not (the
  // enumeration-safe password-reset request) — parse the body when present.
  if (res.status === 204) {
    return undefined as T;
  }
  if (res.status === 202) {
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
    }
  }
  return (await res.json()) as T;
}

// The single in-flight silent refresh. Concurrent 401s (or a 401 racing the
// boot restore) share one rotation — the backend treats reuse of an
// already-rotated refresh token as compromise, so exactly-once matters.
let refreshInFlight: Promise<AuthResponse | null> | null = null;

/**
 * restoreSession attempts one silent cookie-mode refresh: POST /auth/refresh
 * with credentials included and NO body token — the httpOnly `vidra_refresh`
 * cookie is the sole carrier. On success the rotated access token is stored
 * in memory (never localStorage) and the AuthResponse returned; on any
 * failure (no cookie, dead cookie, network) it resolves null — signed out,
 * never an error. Used by AuthProvider on boot and by the 401 retry below.
 */
export function restoreSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const body: RefreshRequest = { cookie_mode: true };
        const res = await doRequest<AuthResponse>(
          REFRESH_PATH,
          { method: "POST", body, credentials: "include" },
          null,
        );
        setAccessToken(res.token);
        return res;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * apiRequest performs a typed JSON call to vidra-core. It attaches an
 * X-Correlation-ID (so frontend and backend logs line up; W3C traceparent is
 * added with the OTel slice), maps the error envelope to ApiError, and returns
 * the parsed body. The Authorization header and token are never logged.
 *
 * Token expiry: when a call made with the STORED access token gets a 401, one
 * silent cookie-mode refresh runs and the request is retried once with the
 * rotated token. A failed refresh — or a second 401 — signs the session out
 * (notifySessionExpired) and rethrows. Calls with an explicit per-call `token`
 * and the session-management endpoints (retryOn401: false) are never retried.
 */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const usedStoredToken = opts.token === undefined && getAccessToken() !== null;
  try {
    return await doRequest<T>(path, opts, opts.token ?? getAccessToken());
  } catch (err) {
    const retriable =
      err instanceof ApiError &&
      err.status === 401 &&
      usedStoredToken &&
      opts.retryOn401 !== false;
    if (!retriable) throw err;

    const restored = await restoreSession();
    if (!restored) {
      // The refresh cookie is gone/dead too — the session is over.
      notifySessionExpired();
      throw err;
    }
    try {
      return await doRequest<T>(path, opts, restored.token);
    } catch (retryErr) {
      if (retryErr instanceof ApiError && retryErr.status === 401) {
        // Still unauthorized with a freshly rotated token: sign out for real.
        notifySessionExpired();
      }
      throw retryErr;
    }
  }
}
