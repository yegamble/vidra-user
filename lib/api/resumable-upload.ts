import { requestId } from "./request-id";
// Resumable (chunked) upload orchestration for the studio's original-file upload.
//
// The flow: open a session (POST /videos/:id/upload-session), PUT each chunk of
// the file sequentially (PUT /uploads/:id/chunks/:n) with per-chunk retry, then
// complete (POST /uploads/:id/complete) — which ACCEPTS the completion and
// answers 202 — and poll GET /uploads/:id until the server has assembled and
// finalised the file.
//
// The completion is asynchronous because it cannot be anything else: assembling
// the chunks back out of object storage, re-uploading the assembled file while
// hashing it, then probing and decoding it for the thumbnail and storyboard is
// minutes of work on a remote bucket — far past the API's 30s request deadline,
// and past a CDN's origin-response cap besides. Uploads used to reach 100% and
// then 5xx for exactly that reason.
//
// Progress is chunk-accurate during the transfer (driven by the server's
// bytes_received) and switches to the "processing" phase for the poll, which has
// no byte counter to report. Cancellation aborts the in-flight chunk and rejects
// as a cancellation (the caller then DELETEs the session); an interruption (a
// browser refresh) leaves a resumable session recorded in localStorage so the
// same file, re-picked, can resume from the chunks that already landed.

import { apiBaseUrl } from "@/lib/config";
import { logger } from "@/lib/logger";

import { ApiError, apiErrorFromBody } from "./client";
import { getAccessToken } from "./auth-store";
import { api } from "./endpoints";
import { computeFileFingerprint } from "./fingerprint";
import type { UploadProgress } from "./upload";
import { UPLOAD_CANCELLED_CODE } from "./upload";
import type { UploadStatusResponse, Video } from "./types";

/** A resumable upload session remembered across an interruption (localStorage). */
export interface StoredUploadSession {
  uploadId: string;
  videoId: string;
  /** The client filename, to match against a re-picked file. */
  filename: string;
  /** The declared byte size, to match against a re-picked file. */
  size: number;
  /**
   * The opaque file fingerprint sent on session create (UPLOAD-02). Optional so
   * legacy cache entries written before fingerprinting still load; the server's
   * GET /api/v1/me/uploads is the source of truth for cross-device resume.
   */
  fileFingerprint?: string;
  /** ISO expiry — a session past this is dropped without offering a resume. */
  expiresAt: string;
}

const STORE_KEY = "vidra.upload-sessions";

/** The ApiError code carried when the server finalised the upload as failed. */
export const UPLOAD_FAILED_CODE = "upload_failed";

/**
 * The ApiError code carried when server-side processing did not settle inside
 * the client's overall cap. The upload is NOT necessarily lost — the job may
 * still finish — so the message says so rather than claiming failure.
 */
export const UPLOAD_PROCESSING_TIMEOUT_CODE = "upload_processing_timeout";

/** Default poll interval while the server finalises (before backoff). */
const DEFAULT_POLL_INTERVAL_MS = 2_000;
/** The poll interval never grows past this — a stalled bar needs a live signal. */
const MAX_POLL_INTERVAL_MS = 10_000;
/**
 * Overall cap on server-side processing. Generous, because a multi-gigabyte
 * upload behind a busy queue legitimately takes a while; finite, because a
 * promise that never settles is a spinner that never stops.
 */
const DEFAULT_PROCESSING_TIMEOUT_MS = 30 * 60_000;

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
  const correlationId = requestId();
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
  /**
   * A precomputed file fingerprint to send on session create. When omitted it is
   * computed from the file (SHA-256 over size + first/last 1 MiB). Ignored on a
   * resume (no new session is opened). Lets a caller that already fingerprinted
   * the file (e.g. to match it against GET /me/uploads) avoid recomputing it.
   */
  fingerprint?: string;
  /**
   * "replace" opens the session via POST /videos/{id}/replace-session, so
   * completion REPLACES the published video's source instead of publishing a
   * draft (config-parity W14). Replace sessions are NOT remembered in
   * localStorage — an interrupted replacement is simply restarted (the server
   * sweeper collects the abandoned session), keeping the resume-match logic
   * scoped to plain uploads. Default "upload".
   */
  mode?: "upload" | "replace";
  /**
   * How long to wait between polls of the session while the server finalises
   * (default 2s, then mild backoff up to 10s). Tests pass 0.
   */
  pollIntervalMs?: number;
  /**
   * Overall cap on the server-side processing phase (default 30 min). Past it
   * the promise rejects with UPLOAD_PROCESSING_TIMEOUT_CODE rather than polling
   * forever; the bytes are safely stored either way.
   */
  processingTimeoutMs?: number;
}

/**
 * What a finished resumable upload resolves to: the finalised video, read back
 * once the server reports the session completed.
 *
 * It used to be the completion response's { video, file } pair. The completion
 * response is now the session's state, so the video is fetched — and `file` is
 * dropped because nothing consumed it.
 */
export interface ResumableUploadResult {
  video: Video;
}

function emit(
  onProgress: ResumableUploadOptions["onProgress"],
  loaded: number,
  total: number,
  phase: "uploading" | "processing" = "uploading",
): void {
  if (!onProgress) return;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0;
  onProgress({ loaded, total, percent, phase });
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

// completeWithRetry POSTs the completion, retrying transient failures on the
// same terms a chunk gets. It is now safe to retry for two reasons the old
// synchronous endpoint could not offer: the call is CHEAP (it validates and
// enqueues, nothing more), and it is IDEMPOTENT (a second POST for a session
// already queued/processing returns the current state instead of running the
// pipeline twice). Losing the response to a transient blip used to strand an
// upload that had already transferred every byte.
async function completeWithRetry(
  uploadId: string,
  opts: ResumableUploadOptions,
): Promise<UploadStatusResponse> {
  const retries = opts.chunkRetries ?? 3;
  const base = opts.retryBaseMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (opts.signal?.aborted) throw cancelledError();
    try {
      return await api.completeUploadSession(uploadId);
    } catch (err) {
      if (isCancelled(err)) throw err;
      if (!isRetriable(err)) throw err;
      lastErr = err;
      if (attempt < retries - 1) await abortableDelay(base * 2 ** attempt, opts.signal);
    }
  }
  throw lastErr instanceof ApiError
    ? lastErr
    : new ApiError({ status: 0, code: "network_error", message: "could not complete the upload" });
}

/**
 * legacyCompletionVideo recognises a PRE-ASYNC backend's completion response.
 *
 * Before the completion queue, POST .../complete ran the whole pipeline inline
 * and answered 201 with { video, file }. This client speaks the new contract, but
 * the frontend and the API deploy separately — and rolling core back to the
 * previous release is meant to be a tag flip. Recognising the old shape means
 * the new frontend keeps working against an old (or rolled-back) core instead of
 * telling every creator their upload vanished, and it makes "frontend first" a
 * safe deploy order.
 *
 * Returns the finalised video when the body is the legacy shape, else null.
 */
function legacyCompletionVideo(body: unknown): Video | null {
  const video = (body as { video?: unknown } | null | undefined)?.video;
  if (video && typeof video === "object" && typeof (video as Video).id === "string") {
    return video as Video;
  }
  return null;
}

/**
 * awaitFinalized polls the session until the server has finished with it.
 *
 * The states it walks are queued → processing → completed | failed. A poll that
 * fails transiently is NOT fatal: the bytes are already stored and the job is
 * already queued, so a network blip mid-poll must not be reported as a failed
 * upload — it just costs another interval. A 4xx (the session vanished, or the
 * caller lost access) is fatal.
 *
 * The interval backs off mildly so a long transcode-heavy queue does not turn
 * into hundreds of requests, and the whole phase is capped so the promise always
 * settles.
 */
async function awaitFinalized(
  uploadId: string,
  first: UploadStatusResponse,
  opts: ResumableUploadOptions,
): Promise<UploadStatusResponse> {
  const base = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + (opts.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS);
  let status = first;
  let wait = base;
  let consecutivePollErrors = 0;

  while (status.state === "queued" || status.state === "processing") {
    if (opts.signal?.aborted) throw cancelledError();
    if (Date.now() > deadline) {
      throw new ApiError({
        status: 0,
        code: UPLOAD_PROCESSING_TIMEOUT_CODE,
        message:
          "the upload is taking longer than expected to process — it may still finish; check Your videos in a few minutes",
      });
    }
    await abortableDelay(wait, opts.signal);
    try {
      status = await api.getUploadSession(uploadId, opts.signal);
      consecutivePollErrors = 0;
    } catch (err) {
      if (isCancelled(err)) throw err;
      // A 4xx means the session is genuinely gone/inaccessible; anything else is
      // transient and the job is still queued server-side.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
      consecutivePollErrors += 1;
      logger.warn("upload status poll failed", {
        upload_id: uploadId,
        consecutive_errors: consecutivePollErrors,
      });
    }
    wait = Math.min(Math.round(wait * 1.5) || base, MAX_POLL_INTERVAL_MS);
  }

  if (status.state === "failed") {
    throw new ApiError({
      status: 0,
      code: UPLOAD_FAILED_CODE,
      message:
        status.failure_reason.trim() !== ""
          ? status.failure_reason
          : "the upload could not be processed",
    });
  }
  if (status.state !== "completed") {
    // "active" (never accepted) or "cancelled" (dropped underneath us).
    throw new ApiError({
      status: 0,
      code: UPLOAD_FAILED_CODE,
      message: "the upload is no longer available",
    });
  }
  return status;
}

/**
 * resumableUpload runs the full chunked upload for `file` against video
 * `videoId` and resolves with the finalised video. It opens a session (or
 * resumes the one in `opts.resume`), PUTs the missing chunks with retry,
 * completes (202), then polls the session until the server has finished
 * assembling and processing the file and reads the video back.
 *
 * On success the remembered session is forgotten. A server-side failure rejects
 * with UPLOAD_FAILED_CODE carrying the server's own reason; a cancellation
 * (aborted signal) rejects with the cancellation ApiError and leaves cleanup to
 * the caller. Note that a resolved video may still be state "failed" — the
 * session completing means the pipeline RAN, not that the probe liked the file,
 * exactly as before.
 */
export async function resumableUpload(
  videoId: string,
  file: File,
  opts: ResumableUploadOptions = {},
): Promise<ResumableUploadResult> {
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
    // The opaque fingerprint lets the server answer "am I already uploading this
    // exact file?" for cross-refresh / cross-device resume (GET /me/uploads).
    const fileFingerprint = opts.fingerprint ?? (await computeFileFingerprint(file));
    if (opts.signal?.aborted) throw cancelledError();
    const open = opts.mode === "replace" ? api.createReplaceSession : api.createUploadSession;
    const session = await open(videoId, {
      size: file.size,
      filename: file.name,
      file_fingerprint: fileFingerprint,
    });
    uploadId = session.upload_id;
    chunkSize = session.chunk_size;
    totalChunks = session.total_chunks;
    received = new Set();
    bytesReceived = 0;
    if (opts.mode !== "replace") {
      rememberUploadSession({
        uploadId,
        videoId,
        filename: file.name,
        size: file.size,
        fileFingerprint,
        expiresAt: session.expires_at,
      });
    }
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

  // Every byte is on the server — the bar reads 100% from here, and the phase
  // becomes "processing" so the UI stops implying bytes are still moving.
  emit(opts.onProgress, file.size, file.size);
  emit(opts.onProgress, file.size, file.size, "processing");

  const accepted = await completeWithRetry(uploadId, opts);
  // A pre-async backend finalised inline and answered with the video itself.
  const legacy = legacyCompletionVideo(accepted);
  if (legacy) {
    forgetUploadSession(uploadId);
    return { video: legacy };
  }
  const finished = await awaitFinalized(uploadId, accepted, opts);
  // Only now is the session finished with: forgetting it earlier would drop the
  // resume record while the server could still fail the finalize.
  forgetUploadSession(uploadId);
  // The session says the pipeline ran; the VIDEO says what it decided.
  const video = await api.getVideo(finished.video_id, undefined, opts.signal);
  return { video };
}
