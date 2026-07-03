import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { isUploadCancelled, uploadWithProgress } from "./upload";

// A minimal XMLHttpRequest test double covering exactly the surface upload.ts
// uses. Tests drive it via respond()/failNetwork()/progress().
type ProgressHandler = (e: { lengthComputable: boolean; loaded: number; total: number }) => void;

class FakeXHR {
  static instances: FakeXHR[] = [];

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = undefined;
  sent = false;
  abortCalled = false;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: { onprogress: ProgressHandler | null } = { onprogress: null };

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  send(body?: unknown): void {
    this.sent = true;
    this.body = body;
  }

  abort(): void {
    this.abortCalled = true;
    this.onabort?.();
  }

  // Test drivers (not part of the real XHR surface).
  respond(status: number, text: string): void {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }

  failNetwork(): void {
    this.onerror?.();
  }

  progress(loaded: number, total: number, lengthComputable = true): void {
    this.upload.onprogress?.({ lengthComputable, loaded, total });
  }
}

function envelope(code: string, message: string, fields?: Array<{ field: string; message: string }>) {
  return JSON.stringify({ error: { code, message, request_id: "req-1", fields } });
}

describe("uploadWithProgress", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function start<T = unknown>(opts: Parameters<typeof uploadWithProgress>[2] = {}) {
    const form = new FormData();
    form.append("file", new File(["x"], "clip.mp4", { type: "video/mp4" }));
    const promise = uploadWithProgress<T>("http://localhost:8080/api/v1/videos/v1/file", form, opts);
    return { promise, xhr: FakeXHR.instances[0], form };
  }

  it("POSTs the form with auth + correlation headers and no content-type", async () => {
    const { promise, xhr, form } = start({ token: "secret" });
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("http://localhost:8080/api/v1/videos/v1/file");
    expect(xhr.body).toBe(form);
    expect(xhr.headers.authorization).toBe("Bearer secret");
    expect(xhr.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    // The browser must set the multipart boundary itself.
    expect(xhr.headers["content-type"]).toBeUndefined();
    xhr.respond(200, JSON.stringify({ ok: true }));
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("omits the authorization header without a token", async () => {
    const { promise, xhr } = start();
    expect(xhr.headers.authorization).toBeUndefined();
    xhr.respond(200, "{}");
    await promise;
  });

  it("reports determinate progress as a rounded percent", async () => {
    const seen: number[] = [];
    const { promise, xhr } = start({ onProgress: (p) => seen.push(p.percent) });
    xhr.progress(0, 200);
    xhr.progress(50, 200);
    xhr.progress(199, 200);
    xhr.progress(200, 200);
    // Non-computable events are ignored (no bogus percents).
    xhr.progress(9, 0, false);
    expect(seen).toEqual([0, 25, 100, 100]);
    xhr.respond(200, "{}");
    await promise;
  });

  it("maps a 413 error envelope to ApiError (status + code + message preserved)", async () => {
    const { promise, xhr } = start();
    xhr.respond(413, envelope("file_too_large", "file exceeds the maximum upload size"));
    const err = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.code).toBe("file_too_large");
    expect(err.message).toBe("file exceeds the maximum upload size");
    expect(err.requestId).toBe("req-1");
    expect(isUploadCancelled(err)).toBe(false);
  });

  it("maps a 422 envelope with field errors to ApiError.fields", async () => {
    const { promise, xhr } = start();
    xhr.respond(
      422,
      envelope("validation_failed", "validation failed", [{ field: "file", message: "not a video" }]),
    );
    const err = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(422);
    expect(err.fields).toEqual([{ field: "file", message: "not a video" }]);
  });

  it("falls back to a generic ApiError on a non-JSON error body", async () => {
    const { promise, xhr } = start();
    xhr.respond(415, "unsupported");
    const err = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(415);
    expect(err.code).toBe("http_error");
    expect(err.message).toBe("request failed with status 415");
  });

  it("maps a network failure to the status-0 network_error ApiError", async () => {
    const { promise, xhr } = start();
    xhr.failNetwork();
    const err = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.code).toBe("network_error");
  });

  it("aborting the signal aborts the XHR and rejects as a cancellation", async () => {
    const controller = new AbortController();
    const { promise, xhr } = start({ signal: controller.signal });
    expect(xhr.sent).toBe(true);
    controller.abort();
    expect(xhr.abortCalled).toBe(true);
    const err = await promise.catch((e: unknown) => e);
    expect(isUploadCancelled(err)).toBe(true);
  });

  it("a pre-aborted signal rejects before anything is sent", async () => {
    const controller = new AbortController();
    controller.abort();
    const { promise } = start({ signal: controller.signal });
    // No XHR was constructed at all... or if it was, nothing was sent.
    expect(FakeXHR.instances.every((x) => !x.sent)).toBe(true);
    const err = await promise.catch((e: unknown) => e);
    expect(isUploadCancelled(err)).toBe(true);
  });

  it("resolves undefined on an empty 2xx body", async () => {
    const { promise, xhr } = start();
    xhr.respond(204, "");
    await expect(promise).resolves.toBeUndefined();
  });
});
