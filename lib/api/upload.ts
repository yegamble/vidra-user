import { requestId } from "./request-id";
// XHR-based multipart upload with determinate progress and cancellation.
//
// fetch() cannot observe request-body upload progress, so the one flow that
// needs a byte-level progress bar — the studio's original-file POST — runs on
// XMLHttpRequest. Every other call stays on the fetch-based client (client.ts).
// Errors map through the SAME envelope parser (apiErrorFromBody), so callers
// branch on ApiError status/code identically regardless of transport: a 413,
// a 415, or a 422 with field errors behaves exactly like apiRequest's.

import { logger } from "@/lib/logger";

import { ApiError, apiErrorFromBody } from "./client";

/**
 * Which half of an upload the progress snapshot describes.
 *
 * "uploading" is bytes leaving the browser — the determinate part. "processing"
 * is everything after the last chunk lands: the server assembles the file out of
 * its chunks, stores it, probes it and builds the thumbnail/storyboard on a
 * queue. That phase has no byte counter to show (loaded == total throughout), so
 * a UI must say "Processing…" rather than sit at a stalled 100%.
 */
export type UploadPhase = "uploading" | "processing";

/** A determinate progress snapshot for an in-flight upload. */
export interface UploadProgress {
  /** Bytes sent so far. */
  loaded: number;
  /** Total bytes to send. */
  total: number;
  /** Whole-number 0–100 (rounded). */
  percent: number;
  /**
   * What the upload is doing. Absent on the multipart (XHR) path, which has no
   * post-transfer phase to report; the resumable path always sets it.
   */
  phase?: UploadPhase;
}

export interface UploadOptions {
  /** Bearer token for the authenticated upload. Never logged. */
  token?: string | null;
  /** Called on determinate progress events (length-computable only). */
  onProgress?: (progress: UploadProgress) => void;
  /**
   * Abort it to cancel: the underlying XHR is aborted and the promise rejects
   * with the "upload_cancelled" ApiError (see isUploadCancelled). A signal that
   * is already aborted rejects before anything is sent.
   */
  signal?: AbortSignal;
}

/** The ApiError code carried by a locally cancelled upload. */
export const UPLOAD_CANCELLED_CODE = "upload_cancelled";

/** True when err is the local cancellation of an in-flight upload (never a server response). */
export function isUploadCancelled(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0 && err.code === UPLOAD_CANCELLED_CODE;
}

function cancelledError(): ApiError {
  return new ApiError({ status: 0, code: UPLOAD_CANCELLED_CODE, message: "upload cancelled" });
}

/**
 * uploadWithProgress POSTs multipart form data to an absolute URL, reporting
 * upload progress and supporting cancellation. The browser sets the multipart
 * content-type (with its boundary); an X-Correlation-ID is attached exactly
 * like every apiRequest call so frontend and backend logs line up. The
 * Authorization header and token are never logged.
 */
export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  opts: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(cancelledError());
      return;
    }

    const correlationId = requestId();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("accept", "application/json");
    xhr.setRequestHeader("x-correlation-id", correlationId);
    if (opts.token) {
      xhr.setRequestHeader("authorization", `Bearer ${opts.token}`);
    }
    // No content-type header: the browser sets multipart/form-data + boundary.

    const onSignalAbort = () => xhr.abort();
    opts.signal?.addEventListener("abort", onSignalAbort, { once: true });
    const cleanup = () => opts.signal?.removeEventListener("abort", onSignalAbort);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total <= 0) return;
      const percent = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
      opts.onProgress?.({ loaded: e.loaded, total: e.total, percent });
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status < 200 || xhr.status >= 300) {
        const err = apiErrorFromBody(xhr.status, xhr.responseText);
        logger.warn("upload failed", {
          url,
          status: err.status,
          error_code: err.code,
          correlation_id: correlationId,
          request_id: err.requestId,
        });
        reject(err);
        return;
      }
      if (xhr.status === 204 || xhr.responseText === "") {
        resolve(undefined as T);
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(
          new ApiError({
            status: xhr.status,
            code: "invalid_response",
            message: "could not parse the server response",
          }),
        );
      }
    };

    xhr.onerror = () => {
      cleanup();
      logger.error("upload network error", { url, correlation_id: correlationId });
      reject(new ApiError({ status: 0, code: "network_error", message: "could not reach the server" }));
    };

    xhr.onabort = () => {
      cleanup();
      reject(cancelledError());
    };

    xhr.send(form);
  });
}
