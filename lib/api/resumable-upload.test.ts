import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { api } from "./endpoints";
import {
  findResumableUploadSession,
  forgetUploadSession,
  rememberUploadSession,
  resumableUpload,
} from "./resumable-upload";
import type { UploadSessionResponse, UploadStatusResponse, Video } from "./types";

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

// A minimal in-memory localStorage (the node test env has none).
function makeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

// A 10-byte file: with an 8→(here 4)-byte chunk it splits into 3 chunks.
function makeFile(size = 10, name = "clip.mp4"): File {
  return new File([new Uint8Array(size)], name, { type: "video/mp4" });
}

function session(): UploadSessionResponse {
  return { upload_id: "up1", chunk_size: 4, total_chunks: 3, size: 10, expires_at: FUTURE };
}

function statusFor(
  received: number[],
  state: UploadStatusResponse["state"] = "active",
): UploadStatusResponse {
  const bytes = received.reduce((s, i) => s + (i === 2 ? 2 : 4), 0);
  return {
    upload_id: "up1",
    video_id: "v1",
    state,
    size: 10,
    chunk_size: 4,
    total_chunks: 3,
    received_chunks: [...received].sort((a, b) => a - b),
    bytes_received: bytes,
    expires_at: FUTURE,
    failure_reason: "",
  };
}

function publishedVideo(): Video {
  return {
    id: "v1",
    remote: false,
    channel_id: "c1",
    title: "clip",
    description: "",
    privacy: "public",
    state: "published",
    created_at: FUTURE,
    is_sensitive: false,
    sensitive_reason: "",
  };
}

function chunkResponse(status: UploadStatusResponse, httpStatus = 200): Response {
  return new Response(JSON.stringify(status), {
    status: httpStatus,
    headers: { "content-type": "application/json" },
  });
}

describe("resumableUpload", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorage());
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(api, "createUploadSession").mockResolvedValue(session());
    // Completion is asynchronous: the POST answers 202 with the session's
    // state. The default mock settles immediately (state "completed") so the
    // tests whose subject is the chunk protocol stay about the chunk protocol.
    vi.spyOn(api, "completeUploadSession").mockResolvedValue(statusFor([0, 1, 2], "completed"));
    vi.spyOn(api, "getVideo").mockResolvedValue(publishedVideo());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // fetchMock that accumulates received chunks from the PUT URL's index.
  function acceptingChunks(): void {
    const received = new Set<number>();
    fetchMock.mockImplementation(async (url: string) => {
      const n = Number(/\/chunks\/(\d+)$/.exec(url)![1]);
      received.add(n);
      return chunkResponse(statusFor([...received]));
    });
  }

  it("opens a session, PUTs every chunk in order, and completes", async () => {
    acceptingChunks();
    const seen: number[] = [];
    const res = await resumableUpload("v1", makeFile(), { onProgress: (p) => seen.push(p.percent) });

    // The create carries the size, filename, AND the computed opaque fingerprint
    // (SHA-256 hex over size + first/last 1 MiB) for cross-device resume.
    expect(api.createUploadSession).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({ size: 10, filename: "clip.mp4", file_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    );
    // Three chunk PUTs at indices 0,1,2 (octet-stream, PUT).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("http://localhost:8080/api/v1/uploads/up1/chunks/0");
    expect(urls[2]).toBe("http://localhost:8080/api/v1/uploads/up1/chunks/2");
    const init0 = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init0.method).toBe("PUT");
    expect((init0.headers as Record<string, string>)["content-type"]).toBe("application/octet-stream");

    expect(api.completeUploadSession).toHaveBeenCalledWith("up1");
    expect(res.video.state).toBe("published");
    // Progress ends at 100; the session is forgotten after completion.
    expect(seen.at(-1)).toBe(100);
    expect(findResumableUploadSession({ name: "clip.mp4", size: 10 })).toBeNull();
  });

  it("resumes by skipping already-received chunks", async () => {
    acceptingChunks();
    const resume = statusFor([0]); // chunk 0 already landed
    await resumableUpload("v1", makeFile(), { resume });

    // create is NOT called on a resume; only chunks 1 and 2 are PUT.
    expect(api.createUploadSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual([
      "http://localhost:8080/api/v1/uploads/up1/chunks/1",
      "http://localhost:8080/api/v1/uploads/up1/chunks/2",
    ]);
    expect(api.completeUploadSession).toHaveBeenCalledWith("up1");
  });

  it("retries a transient chunk failure with backoff, then succeeds", async () => {
    const received = new Set<number>();
    let calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      calls += 1;
      // Fail the first two attempts of chunk 0 with a 503, then accept.
      if (calls <= 2) return chunkResponse(statusFor([]), 503);
      const n = Number(/\/chunks\/(\d+)$/.exec(url)![1]);
      received.add(n);
      return chunkResponse(statusFor([...received]));
    });

    const res = await resumableUpload("v1", makeFile(), { retryBaseMs: 0 });
    // 2 failed + 3 successful chunk PUTs.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(res.video.state).toBe("published");
  });

  it("fails honestly when a chunk exhausts its retries, leaving the session resumable", async () => {
    fetchMock.mockResolvedValue(chunkResponse(statusFor([]), 503));
    const err = await resumableUpload("v1", makeFile(), { chunkRetries: 3, retryBaseMs: 0 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    // 3 attempts on chunk 0, then give up.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(api.completeUploadSession).not.toHaveBeenCalled();
    // The session was remembered on open and is NOT forgotten on failure.
    expect(findResumableUploadSession({ name: "clip.mp4", size: 10 })).toMatchObject({
      uploadId: "up1",
      videoId: "v1",
    });
  });

  it("does not retry a 4xx chunk error (fails fast)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "conflict", message: "already completed" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    const err = await resumableUpload("v1", makeFile(), { retryBaseMs: 0 }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // --- asynchronous completion (202 → poll) --------------------------------
  //
  // Completion no longer returns the finalised video: the server validates,
  // enqueues, and answers 202, because assembling + probing the file takes
  // minutes on a remote object store and cannot fit an HTTP deadline (nor a
  // CDN's origin-response cap). The client polls the session instead.

  it("polls the session after a 202 and resolves with the finished video", async () => {
    acceptingChunks();
    vi.spyOn(api, "completeUploadSession").mockResolvedValue(statusFor([0, 1, 2], "queued"));
    const poll = vi
      .spyOn(api, "getUploadSession")
      .mockResolvedValueOnce(statusFor([0, 1, 2], "processing"))
      .mockResolvedValueOnce(statusFor([0, 1, 2], "completed"));
    const getVideo = vi.spyOn(api, "getVideo").mockResolvedValue(publishedVideo());

    const phases: string[] = [];
    const res = await resumableUpload("v1", makeFile(), {
      pollIntervalMs: 0,
      onProgress: (p) => phases.push(p.phase ?? "uploading"),
    });

    expect(poll).toHaveBeenCalledTimes(2);
    expect(getVideo).toHaveBeenCalledWith("v1", undefined, undefined);
    expect(res.video.state).toBe("published");
    // The UI is told the upload moved from sending bytes to server-side work.
    expect(phases).toContain("processing");
    expect(phases.at(-1)).toBe("processing");
    // A finished upload is forgotten only once it actually finished.
    expect(findResumableUploadSession({ name: "clip.mp4", size: 10 })).toBeNull();
  });

  it("rejects with the server's reason when the session ends failed", async () => {
    acceptingChunks();
    vi.spyOn(api, "completeUploadSession").mockResolvedValue(statusFor([0, 1, 2], "queued"));
    vi.spyOn(api, "getUploadSession").mockResolvedValue({
      ...statusFor([0, 1, 2], "failed"),
      failure_reason: "the file is not a playable video",
    });

    const err = await resumableUpload("v1", makeFile(), { pollIntervalMs: 0 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("upload_failed");
    expect((err as ApiError).message).toBe("the file is not a playable video");
  });

  it("retries a transient failure of the complete POST (it is cheap and idempotent)", async () => {
    acceptingChunks();
    const complete = vi
      .spyOn(api, "completeUploadSession")
      .mockRejectedValueOnce(new ApiError({ status: 503, code: "unavailable", message: "nope" }))
      .mockResolvedValue(statusFor([0, 1, 2], "completed"));
    vi.spyOn(api, "getVideo").mockResolvedValue(publishedVideo());

    const res = await resumableUpload("v1", makeFile(), { retryBaseMs: 0, pollIntervalMs: 0 });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(res.video.state).toBe("published");
  });

  it("gives up after the overall processing cap instead of polling forever", async () => {
    acceptingChunks();
    vi.spyOn(api, "completeUploadSession").mockResolvedValue(statusFor([0, 1, 2], "queued"));
    vi.spyOn(api, "getUploadSession").mockResolvedValue(statusFor([0, 1, 2], "processing"));

    const err = await resumableUpload("v1", makeFile(), {
      pollIntervalMs: 0,
      processingTimeoutMs: 0,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("upload_processing_timeout");
  });

  it("a pre-aborted signal rejects as a cancellation before opening a session", async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await resumableUpload("v1", makeFile(), { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("upload_cancelled");
    expect(api.createUploadSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("upload session store", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers a session and finds it by matching name + size", () => {
    rememberUploadSession({ uploadId: "up1", videoId: "v1", filename: "a.mp4", size: 100, expiresAt: FUTURE });
    expect(findResumableUploadSession({ name: "a.mp4", size: 100 })).toMatchObject({ uploadId: "up1" });
    // A different name or size does not match.
    expect(findResumableUploadSession({ name: "a.mp4", size: 99 })).toBeNull();
    expect(findResumableUploadSession({ name: "b.mp4", size: 100 })).toBeNull();
  });

  it("forgets a session", () => {
    rememberUploadSession({ uploadId: "up1", videoId: "v1", filename: "a.mp4", size: 100, expiresAt: FUTURE });
    forgetUploadSession("up1");
    expect(findResumableUploadSession({ name: "a.mp4", size: 100 })).toBeNull();
  });

  it("drops an expired session instead of offering a resume", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    rememberUploadSession({ uploadId: "old", videoId: "v1", filename: "a.mp4", size: 100, expiresAt: past });
    expect(findResumableUploadSession({ name: "a.mp4", size: 100 })).toBeNull();
  });
});
