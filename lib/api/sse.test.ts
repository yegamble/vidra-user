import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "./auth-store";
import {
  openAuthenticatedEventStream,
  parseEventStream,
  subscribeEventStream,
  type ServerSentEvent,
} from "./sse";

function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function eventResponse(body = ": heartbeat\n\n"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

describe("parseEventStream", () => {
  it("parses chunked CRLF events, comments, multiline data, ids, and retry hints", async () => {
    const events: ServerSentEvent[] = [];
    const body = byteStream([
      ": heart",
      "beat\r\nretry: 2500\r",
      "\nid: 90071992547409930001\r\nevent: job-event\r\ndata: {\"line\":1}\r\n",
      "data: {\"line\":2}\r\n\r\n",
    ]);

    const result = await parseEventStream(body, (event) => events.push(event));

    expect(events).toEqual([
      {
        id: "90071992547409930001",
        event: "job-event",
        data: "{\"line\":1}\n{\"line\":2}",
      },
    ]);
    expect(result).toEqual({ lastEventId: "90071992547409930001", retry: 2500 });
  });

  it("uses message as the default event name and carries the seeded cursor", async () => {
    const events: ServerSentEvent[] = [];
    await parseEventStream(byteStream(["data: ok\n\n"]), (event) => events.push(event), {
      initialLastEventId: "41",
    });
    expect(events).toEqual([{ id: "41", event: "message", data: "ok" }]);
  });

  it("ignores ids containing a null character", async () => {
    const events: ServerSentEvent[] = [];
    await parseEventStream(
      byteStream(["id: bad\0cursor\ndata: ok\n\n"]),
      (event) => events.push(event),
      { initialLastEventId: "7" },
    );
    expect(events[0].id).toBe("7");
  });
});

describe("openAuthenticatedEventStream", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(eventResponse());
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("access-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it("uses bearer auth and Last-Event-ID without putting either in the URL", async () => {
    const controller = new AbortController();
    await openAuthenticatedEventStream("/api/v1/admin/jobs/events", {
      query: { state: "running", after: undefined },
      lastEventId: "90071992547409930001",
      signal: controller.signal,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/jobs/events?state=running");
    expect(url).not.toContain("access-secret");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer access-secret");
    expect(headers["last-event-id"]).toBe("90071992547409930001");
    expect(headers.accept).toBe("text/event-stream");
    expect(headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a successful non-SSE response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      openAuthenticatedEventStream("/api/v1/admin/jobs/events", {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "invalid_event_stream" });
  });

  it("does not connect when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const subscription = subscribeEventStream("/api/v1/admin/jobs/events", {
      signal: controller.signal,
      onEvent: vi.fn(),
    });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    subscription.close();
  });
});
