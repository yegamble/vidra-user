import { requestId } from "./request-id";
import { absoluteApiBaseUrl } from "@/lib/config";
import { logger } from "@/lib/logger";
import { activeTraceFields, injectTraceContext } from "@/lib/observability/trace";

import { getAccessToken, notifySessionExpired } from "./auth-store";
import { ApiError, apiErrorFromBody, restoreSession } from "./client";

const DEFAULT_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;
const MAX_EVENT_BYTES = 256 * 1024;

type Query = Record<string, string | number | boolean | undefined>;

export type ServerSentEvent = {
  /** The opaque replay cursor. Never coerce it to a number. */
  id?: string;
  event: string;
  data: string;
};

export type EventStreamState = "connecting" | "live" | "reconnecting";

export type EventStreamSubscription = {
  close: () => void;
};

export type EventStreamOptions = {
  query?: Query;
  /** Initial opaque cursor from the REST snapshot's event_cursor field. */
  lastEventId?: string;
  signal?: AbortSignal;
  onEvent: (event: ServerSentEvent) => void;
  onStateChange?: (state: EventStreamState) => void;
  /** Called when retention has pruned the cursor, or the cursor is invalid. */
  onCursorInvalid?: (error: ApiError) => void;
  onError?: (error: unknown) => void;
};

function buildUrl(path: string, query?: Query): string {
  const url = new URL(absoluteApiBaseUrl() + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

async function responseError(response: Response): Promise<ApiError> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // Keep the generic error envelope when the response body cannot be read.
  }
  return apiErrorFromBody(response.status, body);
}

async function openOnce(
  path: string,
  query: Query | undefined,
  lastEventId: string | undefined,
  token: string | null,
  signal: AbortSignal,
): Promise<Response> {
  const correlationId = requestId();
  const headers: Record<string, string> = {
    accept: "text/event-stream",
    "cache-control": "no-cache",
    "x-correlation-id": correlationId,
  };
  if (lastEventId) headers["last-event-id"] = lastEventId;
  if (token) headers.authorization = `Bearer ${token}`;
  injectTraceContext(headers);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method: "GET",
      headers,
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    logger.warn("event stream connection failed", {
      path,
      correlation_id: correlationId,
      ...activeTraceFields(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: "could not reach the server",
    });
  }

  if (!response.ok) throw await responseError(response);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/event-stream")) {
    throw new ApiError({
      status: response.status,
      code: "invalid_event_stream",
      message: "server did not return an event stream",
    });
  }
  if (!response.body) {
    throw new ApiError({
      status: response.status,
      code: "invalid_event_stream",
      message: "server returned an empty event stream",
    });
  }
  return response;
}

/**
 * openAuthenticatedEventStream opens one authenticated SSE response. It mirrors
 * apiRequest's in-memory bearer + one silent-refresh retry without ever placing
 * a token in the URL (native EventSource cannot safely authenticate this API).
 */
export async function openAuthenticatedEventStream(
  path: string,
  options: {
    query?: Query;
    lastEventId?: string;
    signal: AbortSignal;
  },
): Promise<Response> {
  const token = getAccessToken();
  try {
    return await openOnce(path, options.query, options.lastEventId, token, options.signal);
  } catch (error) {
    const retry = error instanceof ApiError && error.status === 401 && token !== null;
    if (!retry) throw error;

    const restored = await restoreSession();
    if (!restored) {
      notifySessionExpired();
      throw error;
    }
    try {
      return await openOnce(
        path,
        options.query,
        options.lastEventId,
        restored.token,
        options.signal,
      );
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        notifySessionExpired();
      }
      throw retryError;
    }
  }
}

type ParserState = {
  data: string;
  event: string;
  id?: string;
  retry?: number;
};

function blankParserState(id?: string): ParserState {
  return { data: "", event: "", id };
}

function nextLine(buffer: string, eof: boolean): { line: string; rest: string } | null {
  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i];
    if (char === "\n") return { line: buffer.slice(0, i), rest: buffer.slice(i + 1) };
    if (char !== "\r") continue;
    // A CR at the very end of a chunk may be the first half of CRLF.
    if (i + 1 === buffer.length && !eof) return null;
    const width = buffer[i + 1] === "\n" ? 2 : 1;
    return { line: buffer.slice(0, i), rest: buffer.slice(i + width) };
  }
  if (eof && buffer.length > 0) return { line: buffer, rest: "" };
  return null;
}

/** Parse an SSE response body, including arbitrary UTF-8/chunk boundaries. */
export async function parseEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ServerSentEvent) => void,
  options: { initialLastEventId?: string; signal?: AbortSignal } = {},
): Promise<{ lastEventId?: string; retry?: number }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let state = blankParserState(options.initialLastEventId);
  let retry: number | undefined;

  const processLine = (line: string) => {
    if (line === "") {
      if (state.data !== "") {
        onEvent({
          event: state.event || "message",
          data: state.data.slice(0, -1),
          ...(state.id !== undefined ? { id: state.id } : {}),
        });
      }
      if (state.retry !== undefined) retry = state.retry;
      state = blankParserState(state.id);
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "data":
        if (state.data.length + value.length + 1 > MAX_EVENT_BYTES) {
          throw new ApiError({
            status: 0,
            code: "event_too_large",
            message: "event stream message exceeded the client limit",
          });
        }
        state.data += `${value}\n`;
        break;
      case "event":
        state.event = value;
        break;
      case "id":
        if (!value.includes("\0")) state.id = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) state.retry = Number.parseInt(value, 10);
        break;
      default:
        break;
    }
  };

  try {
    while (true) {
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > MAX_EVENT_BYTES * 2) {
        throw new ApiError({
          status: 0,
          code: "event_too_large",
          message: "event stream buffer exceeded the client limit",
        });
      }
      let extracted = nextLine(buffer, done);
      while (extracted) {
        buffer = extracted.rest;
        processLine(extracted.line);
        extracted = nextLine(buffer, done);
      }
      if (done) break;
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The fetch signal may already have closed the reader.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  return { lastEventId: state.id, retry };
}

/**
 * Subscribe with automatic resumable reconnect. The caller owns polling
 * fallback: any state other than `live` is a safe signal to poll REST.
 */
export function subscribeEventStream(
  path: string,
  options: EventStreamOptions,
): EventStreamSubscription {
  const controller = new AbortController();
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let cursor = options.lastEventId;
  let reconnectMs = DEFAULT_RECONNECT_MS;
  let first = true;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    controller.abort();
    options.signal?.removeEventListener("abort", stop);
  };
  if (options.signal?.aborted) {
    stop();
    return { close: stop };
  }
  options.signal?.addEventListener("abort", stop, { once: true });

  const scheduleReconnect = (serverRetry?: number) => {
    if (stopped) return;
    options.onStateChange?.("reconnecting");
    const requested = serverRetry && serverRetry > 0 ? serverRetry : reconnectMs;
    const delay = Math.min(Math.max(requested, DEFAULT_RECONNECT_MS), MAX_RECONNECT_MS);
    reconnectMs = Math.min(delay * 2, MAX_RECONNECT_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (stopped) return;
    options.onStateChange?.(first ? "connecting" : "reconnecting");
    first = false;
    try {
      const response = await openAuthenticatedEventStream(path, {
        query: options.query,
        lastEventId: cursor,
        signal: controller.signal,
      });
      if (stopped) return;
      options.onStateChange?.("live");
      reconnectMs = DEFAULT_RECONNECT_MS;
      const parsed = await parseEventStream(
        response.body as ReadableStream<Uint8Array>,
        (event) => {
          if (event.id !== undefined) cursor = event.id;
          options.onEvent(event);
        },
        { initialLastEventId: cursor, signal: controller.signal },
      );
      if (parsed.lastEventId !== undefined) cursor = parsed.lastEventId;
      scheduleReconnect(parsed.retry);
    } catch (error) {
      if (stopped || isAbort(error, controller.signal)) return;
      if (
        error instanceof ApiError &&
        (error.status === 410 ||
          error.code === "event_cursor_expired" ||
          error.code === "invalid_event_cursor")
      ) {
        options.onCursorInvalid?.(error);
        return;
      }
      options.onError?.(error);
      scheduleReconnect();
    }
  };

  void connect();
  return { close: stop };
}
