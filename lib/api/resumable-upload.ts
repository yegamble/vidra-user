// Resumable (chunked) upload orchestration for the studio's original-file upload.
//
// The flow: open a session (POST /videos/:id/upload-session), PUT each chunk of
// the file sequentially (PUT /uploads/:id/chunks/:n) with per-chunk retry, then
// complete (POST /uploads/:id/complete) to assemble + finalise the video through
// the same pipeline as a direct upload. Progress is chunk-accurate (driven by the
// server's bytes_received). Cancellation aborts the in-flight chunk and rejects
// as a cancellation (the caller then DELETEs the session); an interruption (a
// browser refresh) leaves a resumable session recorded in localStorage so the
// same file, re-picked, can resume from the chunks that already landed.

import { apiBaseUrl } from "@/lib/config";
import { logger } from "@/lib/logger";

import { ApiError, apiErrorFromBody } from "./client";
import { getAccessToken } from "./auth-store";
import { api } from "./endpoints";
import type { UploadProgress } from "./upload";
import { UPLOAD_CANCELLED_CODE } from "./upload";
import type { UploadStatusResponse, UploadVideoResult } from "./types";

/** A resumable upload session remembered across an interruption (localStorage). */
export interface StoredUploadSession {
  uploadId: string;
  videoId: string;
  /** The client filename, to match against a re-picked file. */
  filename: string;
  /** The declared byte size, to match against a re-picked file. */
  size: number;
  /** ISO expiry — a session past this is dropped without offering a resume. */
  expiresAt: string;
}

const STORE_KEY = "vidra.upload-sessions";

function cancelledError(): ApiError {
  return new ApiError({ status: 0, code: UPLOAD_CANCELLED_CODE, message: "upload cancelled" });
}

function isCancelled(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0 && err.code === UPLOAD_CANCELLED_CODE;
}

// A chunk PUT is retriable only on a transient failure: a network error
// (status 0) or a 5xx. A 4xx (404/409/413/422) will not get better on retry.
function isRetriable(err: unknown): boolean {
  return err instanceof ApiError && !isCancelled(err) && (err.status === 0 || err.status >= 500);
}

// --- localStorage session store ---------------------------------------------

function readStore(): StoredUploadSession[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredUploadSession[]) : [];
  } catch {
    return [];
  }
}

function writeStore(list: StoredUploadSession[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // A full/blocked storage is non-fatal — resume is a best-effort nicety.
  }
}

// Drop expired sessions (and de-dupe on uploadId) whenever the store is touched.
function prune(list: StoredUploadSession[]): StoredUploadSession[] {
  const now = Date.now();
  const seen = new Set<string>();
  const kept: StoredUploadSession[] = [];
  for (const s of list) {
    if (seen.has(s.uploadId)) continue;
    const expiry = Date.parse(s.expiresAt);
    if (!Number.isNaN(expiry) && expiry <= now) continue;
    seen.add(s.uploadId);
    kept.push(s);
  }
  return kept;
}

/** rememberUploadSession records an open session so it can survive a refresh. */
export function rememberUploadSession(s: StoredUploadSession): void {
  const list = prune(readStore()).filter((x) => x.uploadId !== s.uploadId);
  list.push(s);
  writeStore(list);
}

/** forgetUploadSession drops a session once it is completed or abandoned. */
export function forgetUploadSession(uploadId: string): void {
  writeStore(prune(readStore()).filter((x) => x.uploadId !== uploadId));
}

/**
 * findResumableUploadSession returns a non-expired remembered session whose
 * filename + size match the given file (the resume match key), or null.
 */
export function findResumableUploadSession(file: { name: string; size: number }): StoredUploadSession | null {
  const pruned = prune(readStore());
  // Persist the prune so expired entries do not accumulate.
  writeStore(pruned);
  return pruned.find((s) => s.filename === file.name && s.size === file.size) ?? null;
}

// --- chunk transport ---------------------------------------------------------

// putUploadChunk stores one chunk (raw octet-stream body) at index n. Unlike the
// JSON client, this streams a Blob body, so it lives here rather than in the
// fetch/JSON client. Errors map through the SAME envelope parser as apiRequest.
async function putUploadChunk(
  uploadId: string,
  n: number,
  chunk: Blob,
  signal?: AbortSignal,
): Promise<UploadStatusResponse> {
  const url = `${apiBaseUrl}/api/v1/uploads/${encodeURIComponent(uploadId)}/chunks/${n}`;
  const correlationId = crypto.randomUUID();
  const token = getAccessToken();
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/octet-stream",
    "x-correlation-id": correlationId,
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { method: "PUT", headers, body: chunk, signal });
  } catch (cause) {
    if (signal?.aborted) throw cancelledError();
    logger.warn("upload chunk network error", { upload_id: uploadId, chunk: n, correlation_id: correlationId });
    void cause;
    throw new ApiError({ status: 0, code: "network_error", message: "could not reach the server" });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw apiErrorFromBody(res.status, text);
  }
  return (await res.json()) as UploadStatusResponse;
}

// abortableDelay resolves after ms, or rejects as a cancellation if aborted.
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// --- orchestration -----------------------------------------------------------

export interface ResumableUploadOptions {
  /** Chunk-accurate progress (driven by the server's bytes_received). */
  onProgress?: (progress: UploadProgress) => void;
  /** Abort to cancel: the in-flight chunk aborts and the promise rejects as a cancellation. */
  signal?: AbortSignal;
  /** Per-chunk transient-failure retries before failing honestly (default 3). */
  chunkRetries?: number;
  /** Base backoff between chunk retries in ms; doubles each retry (default 500). */
  retryBaseMs?: number;
  /**
   * An existing session status to resume from (its received_chunks are skipped)
   * instead of opening a new session — the "Resume upload" path.
   */
  resume?: UploadStatusResponse;
  /**
   * Called with the upload id as soon as the session is opened (or resumed), so
   * a caller can DELETE the session if it later cancels.
   */
  onSessionOpened?: (uploadId: string) => void;
}

function emit(onProgress: ResumableUploadOptions["onProgress"], loaded: number, total: number): void {
  if (!onProgress) return;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0;
  onProgress({ loaded, total, percent });
}

// putChunkWithRetry sends one chunk, retrying transient failures with backoff.
async function putChunkWithRetry(
  uploadId: string,
  n: number,
  chunk: Blob,
  opts: ResumableUploadOptions,
): Promise<UploadStatusResponse> {
  const retries = opts.chunkRetries ?? 3;
  const base = opts.retryBaseMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (opts.signal?.aborted) throw cancelledError();
    try {
      return await putUploadChunk(uploadId, n, chunk, opts.signal);
    } catch (err) {
      if (isCancelled(err)) throw err;
      if (!isRetriable(err)) throw err;
      lastErr = err;
      if (attempt < retries - 1) await abortableDelay(base * 2 ** attempt, opts.signal);
    }
  }
  // Retries exhausted: surface the last transient failure honestly. The session
  // is left intact (recorded) so re-picking the same file can resume it.
  throw lastErr instanceof ApiError
    ? lastErr
    : new ApiError({ status: 0, code: "network_error", message: "the upload failed after several retries" });
}

/**
 * resumableUpload runs the full chunked upload for `file` against video `videoId`
 * and returns the finalised video (the same shape as a direct upload). It opens
 * a session (or resumes the one in `opts.resume`), PUTs the missing chunks with
 * retry, and completes. On success the remembered session is forgotten; on a
 * cancellation (aborted signal) it rejects with the cancellation ApiError and
 * leaves cleanup to the caller.
 */
export async function resumableUpload(
  videoId: string,
  file: File,
  opts: ResumableUploadOptions = {},
): Promise<UploadVideoResult> {
  if (opts.signal?.aborted) throw cancelledError();

  let uploadId: string;
  let chunkSize: number;
  let totalChunks: number;
  let received: Set<number>;
  let bytesReceived: number;

  if (opts.resume) {
    uploadId = opts.resume.upload_id;
    chunkSize = opts.resume.chunk_size;
    totalChunks = opts.resume.total_chunks;
    received = new Set(opts.resume.received_chunks);
    bytesReceived = opts.resume.bytes_received;
  } else {
    const session = await api.createUploadSession(videoId, { size: file.size, filename: file.name });
    uploadId = session.upload_id;
    chunkSize = session.chunk_size;
    totalChunks = session.total_chunks;
    received = new Set();
    bytesReceived = 0;
    rememberUploadSession({
      uploadId,
      videoId,
      filename: file.name,
      size: file.size,
      expiresAt: session.expires_at,
    });
  }

  opts.onSessionOpened?.(uploadId);

  // Show the starting point immediately (0 for a fresh upload, the resumed
  // byte count for a resume) so the bar is accurate before the first chunk.
  emit(opts.onProgress, bytesReceived, file.size);

  for (let n = 0; n < totalChunks; n++) {
    if (opts.signal?.aborted) throw cancelledError();
    if (received.has(n)) continue;
    const start = n * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const status = await putChunkWithRetry(uploadId, n, file.slice(start, end), opts);
    received = new Set(status.received_chunks);
    bytesReceived = status.bytes_received;
    emit(opts.onProgress, bytesReceived, file.size);
  }

  if (opts.signal?.aborted) throw cancelledError();
  const result = await api.completeUploadSession(uploadId);
  forgetUploadSession(uploadId);
  // A completed upload is fully sent — make sure the bar reads 100%.
  emit(opts.onProgress, file.size, file.size);
  return result;
}
