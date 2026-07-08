"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import {
  ApiError,
  api,
  computeFileFingerprint,
  forgetUploadSession,
  isUploadCancelled,
  resumableUpload,
} from "@/lib/api";
import type { ActiveUpload, Video } from "@/lib/api";
import { formatBytes } from "@/lib/format";

// UploadRecoveryCard — server-side draft recovery (UPLOAD-02/03). On studio load
// it reads GET /api/v1/me/uploads (the SERVER's list of the caller's unfinished
// resumable sessions — the source of truth, surviving a refresh or a different
// device where localStorage never had the record) and offers, per session, to
// Resume (re-pick the file, verified by fingerprint) or Discard (DELETE the
// session server-side). Same surface-muted vocabulary as StudioStorageCard; a
// load failure or an empty list hides it (never a faked recovery surface).

// expiresInLabel renders a future ISO instant as a short "expires in 23h"
// countdown (the session's 24h TTL). "expired"/"" for a past/unparseable time.
function expiresInLabel(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `expires in ${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `expires in ${hrs}h`;
  return `expires in ${Math.round(hrs / 24)}d`;
}

// receivedBytes approximates how many bytes have already landed from the received
// chunk COUNT the list carries: every chunk but the last is exactly chunk_size,
// so count*chunk_size is exact until the final chunk, clamped to the total.
function receivedBytes(u: ActiveUpload): number {
  return Math.min(u.received_chunks * u.chunk_size, u.size);
}

// pickedFileMatches verifies a re-picked file is the SAME file as the session:
// by opaque fingerprint when the session carries one (server truth), else by the
// filename + declared size the session recorded (legacy sessions predating it).
function pickedFileMatches(file: File, upload: ActiveUpload, fingerprint: string): boolean {
  if (upload.file_fingerprint) return fingerprint === upload.file_fingerprint;
  return file.name === upload.filename && file.size === upload.size;
}

export function UploadRecoveryCard({ onResumed }: { onResumed?: () => void }) {
  const [uploads, setUploads] = useState<ActiveUpload[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listMyUploads(undefined, controller.signal)
      .then((res) => setUploads(res.uploads))
      .catch(() => {
        // Non-blocking: on any failure the card simply doesn't render.
      });
    return () => controller.abort();
  }, []);

  function removeRow(uploadId: string) {
    setUploads((list) => (list ? list.filter((u) => u.upload_id !== uploadId) : list));
  }

  if (!uploads || uploads.length === 0) return null;

  return (
    <section
      aria-label="Unfinished uploads"
      className="flex flex-col gap-3 rounded-2xl bg-surface-muted px-4 py-3.5"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-fg">Resume an upload</span>
        <span className="text-[12.5px] leading-relaxed text-fg-muted">
          These uploads didn’t finish. Pick each file again to continue — your browser can’t
          reopen it automatically after a refresh.
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {uploads.map((u) => (
          <RecoveryRow
            key={u.upload_id}
            upload={u}
            onResumed={onResumed}
            onRemoved={() => removeRow(u.upload_id)}
          />
        ))}
      </ul>
    </section>
  );
}

type RowPhase = "idle" | "resuming" | "error" | "done";

function RecoveryRow({
  upload,
  onResumed,
  onRemoved,
}: {
  upload: ActiveUpload;
  onResumed?: () => void;
  onRemoved: () => void;
}) {
  const [phase, setPhase] = useState<RowPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [bytes, setBytes] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneVideo, setDoneVideo] = useState<Video | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initialReceived = receivedBytes(upload);
  const initialPercent =
    upload.size > 0 ? Math.min(100, Math.round((initialReceived / upload.size) * 100)) : 0;
  const shownBytes = bytes ?? { loaded: initialReceived, total: upload.size };
  const shownPercent = phase === "resuming" ? progress : initialPercent;

  // Resume the interrupted upload with the re-picked file: verify it is the same
  // file (fingerprint, else name+size), read the session's received chunks, then
  // PUT only the missing ones and complete — the draft already carries metadata.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a mismatch
    if (!file || phase === "resuming") return;
    setError(null);

    let fingerprint = "";
    try {
      fingerprint = await computeFileFingerprint(file);
    } catch {
      // A fingerprint failure is non-fatal — fall back to the name+size check.
    }
    if (!pickedFileMatches(file, upload, fingerprint)) {
      setError(`That’s a different file — choose “${upload.filename}” to resume.`);
      setPhase("error");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("resuming");
    setProgress(initialPercent);
    setBytes({ loaded: initialReceived, total: upload.size });
    try {
      const status = await api.getUploadSession(upload.upload_id, controller.signal);
      if (status.state !== "active") {
        forgetUploadSession(upload.upload_id);
        setError("That unfinished upload is no longer available.");
        setPhase("error");
        return;
      }
      const res = await resumableUpload(status.video_id, file, {
        resume: status,
        onProgress: (p) => {
          setProgress(p.percent);
          setBytes({ loaded: p.loaded, total: p.total });
        },
        signal: controller.signal,
      });
      forgetUploadSession(upload.upload_id);
      if (res.video.state === "failed") {
        // A dead upload must never read as published (the false-success guard).
        setError(
          "Processing failed — the file could not be published. Check that it is a valid video file and try again.",
        );
        setPhase("error");
        return;
      }
      setDoneVideo(res.video);
      setPhase("done");
      onResumed?.();
    } catch (err) {
      if (isUploadCancelled(err)) {
        // Cancel leaves the session intact so it can be resumed again later.
        setPhase("idle");
        setBytes(null);
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        forgetUploadSession(upload.upload_id);
        setError("That unfinished upload is no longer available.");
        setPhase("error");
        return;
      }
      setError("Resume failed. Please try again.");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }

  // Discard abandons the session: DELETE it (drops its chunk blobs) and best-effort
  // delete its orphaned draft video, then drop the row.
  async function discard() {
    if (phase === "resuming") return;
    await api.cancelUploadSession(upload.upload_id).catch(() => {});
    forgetUploadSession(upload.upload_id);
    void api.deleteVideo(upload.video_id).catch(() => {});
    onRemoved();
  }

  if (phase === "done" && doneVideo) {
    return (
      <li className="flex flex-col gap-1 rounded-xl bg-surface px-3.5 py-3 text-sm">
        <span className="truncate font-medium text-fg">{upload.filename}</span>
        <span role="status" className="text-success">
          Upload finished.{" "}
          {doneVideo.state === "published" ? (
            <Link href={`/videos/${doneVideo.id}`} className="font-semibold underline">
              View “{doneVideo.title}”
            </Link>
          ) : (
            <span className="text-fg-muted">
              It’s processing and will appear in Your videos shortly.
            </span>
          )}
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface px-3.5 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate font-medium text-fg">{upload.filename}</span>
        <span className="shrink-0 tabular-nums text-[12.5px] text-fg-muted">
          {expiresInLabel(upload.expires_at)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={`Upload progress for ${upload.filename}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shownPercent}
          className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong"
        >
          <div
            className="h-full rounded-full bg-fg transition-[width] duration-300"
            style={{ width: `${shownPercent}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums text-[12.5px] text-fg-muted">
          {formatBytes(shownBytes.loaded)} of {formatBytes(shownBytes.total)}
        </span>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {phase === "resuming" ? (
          <>
            <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
              <LoaderIcon size={16} className="animate-spin" />
              Resuming…
            </span>
            <Button
              variant="danger-outline"
              size="sm"
              aria-label={`Cancel resuming ${upload.filename}`}
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              aria-label={`Resume ${upload.filename}`}
              onClick={() => inputRef.current?.click()}
            >
              Resume upload
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Discard ${upload.filename}`}
              onClick={() => void discard()}
            >
              Discard
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              tabIndex={-1}
              aria-hidden="true"
              className="hidden"
              onChange={(e) => void onPick(e)}
            />
          </>
        )}
      </div>
    </li>
  );
}
