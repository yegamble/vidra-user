"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { CheckIcon, LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  ApiError,
  api,
  errorMessage,
  forgetUploadSession,
  isUploadCancelled,
  resumableUpload,
} from "@/lib/api";
import type { Channel, QuotaStatus, VideoPrivacy } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import {
  MAX_CONCURRENT_UPLOADS,
  allSettled,
  makeBatchItems,
  overQuotaIds,
  queueReducer,
  selectStartable,
  titleFromFilename,
  type BatchItem,
  type BatchItemStatus,
} from "@/lib/upload-queue";

// BatchUploadQueue — the studio's multi-file (batch) upload surface (UPLOAD-10 /
// W2.U4). It is shown when the creator picks more than one video file at once:
// each file becomes a queued row with a per-file title (prefilled from the
// filename), an independent byte-detail progress line, a status pill, and
// cancel/retry per row. Uploads run through the SAME per-video resumable protocol
// as a single upload (create draft → open session → PUT chunks → complete), with
// two policies layered on top by the pure lib/upload-queue reducer:
//   • bounded parallelism — at most MAX_CONCURRENT_UPLOADS sessions run at once;
//     the rest wait as `queued`. On the server's active-session cap (429
//     too_many_active_uploads) a row RE-QUEUES (backs off) rather than failing.
//   • quota preflight — the sum of the pending sizes is checked against the
//     caller's storage quota before any bytes move; rows that would exceed it are
//     marked `over_quota` up front (the server stays the final authority).
// Design vocabulary matches the DR9 studio: surface rows, the 5px byte-detail
// progress bar, and the status-pill treatment — tokens only, SVG icons only.

// Token recipe for the per-file title input (mirrors the studio form fields).
const FIELD =
  "w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";

// How long to pause opening new sessions after the server reports the per-user
// active-session cap, so the batch waits for a slot instead of hammering the API.
const LIMIT_BACKOFF_MS = 3_000;

const PILL: Record<BatchItemStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-surface-strong text-fg-muted" },
  uploading: { label: "Uploading", className: "bg-warning/15 text-warning" },
  done: { label: "Done", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-danger-surface text-danger" },
  cancelled: { label: "Cancelled", className: "bg-surface-strong text-fg-muted" },
  over_quota: { label: "Over quota", className: "bg-warning/15 text-warning" },
};

function StatusPill({ status }: { status: BatchItemStatus }) {
  const { label, className } = PILL[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${className}`}
    >
      {label}
    </span>
  );
}

// batchUploadError maps a per-row failure to safe, friendly copy (mirrors the
// single-upload form's mapping).
function batchUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 415) return "That is not a supported video type.";
    if (err.status === 413) return "That file is too large.";
    if (err.code === "quota_exceeded") {
      return "This upload would exceed your storage quota.";
    }
  }
  return errorMessage(err, "Upload failed. Please try again.");
}

// The false-success guard copy: the upload's HTTP call succeeded but the video
// came back state="failed" (a probe/scan rejected it) — never "Done".
const FAILED_STATE_ERROR =
  "Processing failed — the file could not be published. Check that it is a valid video file and try again.";

// isActiveSessionLimit is the server's fairness backoff signal: a 429 (the stable
// too_many_active_uploads code, or a plain rate-limit) means "wait for a slot",
// so the row re-queues rather than failing.
function isActiveSessionLimit(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429;
}

export function BatchUploadQueue({
  initialFiles,
  channels,
  defaultHandle,
  defaultPrivacy,
  onUploaded,
  onClearBatch,
}: {
  initialFiles: File[];
  channels: Channel[];
  defaultHandle: string;
  defaultPrivacy: VideoPrivacy;
  /** Called after each file finalises, so the studio can refresh Your videos. */
  onUploaded?: () => void;
  /** Dismiss the batch surface (back to the single-file form). */
  onClearBatch: () => void;
}) {
  const [items, dispatch] = useReducer(queueReducer, []);
  const [started, setStarted] = useState(false);
  const [handle, setHandle] = useState(defaultHandle);
  const [privacy, setPrivacy] = useState<VideoPrivacy>(defaultPrivacy);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  // Bumped to re-run the orchestration effect after a row settles or a backoff
  // window elapses (so the next queued row starts).
  const [, setTick] = useState(0);

  // Which ids are actively being processed (guards the effect against
  // double-starting a row before the reducer reflects its "uploading" status).
  const runningRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const backoffUntilRef = useRef(0);
  const seededRef = useRef(false);
  // Latest values read by the async run loop (kept fresh without restarting it).
  const itemsRef = useRef(items);
  const handleRef = useRef(handle);
  const privacyRef = useRef(privacy);
  const onUploadedRef = useRef(onUploaded);

  // Mirror the current render's values into refs (after commit, before the
  // orchestration effect below reads them) so the async run loop never restarts
  // just because a shared field changed.
  useEffect(() => {
    itemsRef.current = items;
    handleRef.current = handle;
    privacyRef.current = privacy;
    onUploadedRef.current = onUploaded;
  });

  // Load the caller's storage picture for the preflight (same contract as the
  // storage card). A failure leaves quota null → the preflight is skipped (fail
  // open; the server's 422 quota_exceeded stays the final authority).
  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyQuota(controller.signal)
      .then((q) => {
        setQuota(q);
        setQuotaLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuotaLoaded(true);
      });
    return () => controller.abort();
  }, []);

  // Seed the rows once, after the quota is known: build the queued items, run the
  // preflight, and mark the over-quota rows before any bytes move.
  useEffect(() => {
    if (seededRef.current || !quotaLoaded) return;
    const built = makeBatchItems(initialFiles);
    const over = new Set(overQuotaIds(built, quota));
    const seeded = built.map((it) =>
      over.has(it.id) ? { ...it, status: "over_quota" as const } : it,
    );
    dispatch({ type: "enqueue", items: seeded });
    seededRef.current = true;
  }, [quotaLoaded, quota, initialFiles]);

  // runOne drives a single row end to end: create its draft, upload the file
  // through the resumable protocol, and record the honest terminal outcome. A
  // cancellation cleans up the session + orphaned draft; the active-session cap
  // re-queues (backoff); every other error fails the row (retryable).
  const runOne = useCallback(async (item: BatchItem, controller: AbortController) => {
    dispatch({ type: "start", id: item.id });
    let draftId: string | null = null;
    let sessionId: string | null = null;
    try {
      const draft = await api.createVideoDraft(handleRef.current, {
        title: item.title.trim() || titleFromFilename(item.file.name),
        privacy: privacyRef.current,
      });
      draftId = draft.id;
      if (controller.signal.aborted) {
        void api.deleteVideo(draft.id).catch(() => {});
        dispatch({ type: "cancel", id: item.id });
        return;
      }
      const res = await resumableUpload(draft.id, item.file, {
        onProgress: (p) =>
          dispatch({ type: "progress", id: item.id, loaded: p.loaded, total: p.total, percent: p.percent }),
        signal: controller.signal,
        onSessionOpened: (sid) => {
          sessionId = sid;
        },
      });
      // A dead upload must never read as done (the false-success guard).
      if (res.video.state === "failed") {
        dispatch({ type: "fail", id: item.id, error: FAILED_STATE_ERROR });
      } else {
        dispatch({ type: "succeed", id: item.id, videoId: res.video.id });
        onUploadedRef.current?.();
      }
    } catch (err) {
      if (isUploadCancelled(err)) {
        if (sessionId) {
          void api.cancelUploadSession(sessionId).catch(() => {});
          forgetUploadSession(sessionId);
        }
        if (draftId) void api.deleteVideo(draftId).catch(() => {});
        dispatch({ type: "cancel", id: item.id });
      } else if (isActiveSessionLimit(err)) {
        // The per-user active-session cap: wait for a slot, don't fail. Drop the
        // just-created draft (no session opened) so the retry starts clean.
        if (draftId) void api.deleteVideo(draftId).catch(() => {});
        backoffUntilRef.current = Date.now() + LIMIT_BACKOFF_MS;
        dispatch({ type: "requeue", id: item.id });
        const timer = setTimeout(() => {
          timersRef.current.delete(timer);
          setTick((t) => t + 1);
        }, LIMIT_BACKOFF_MS);
        timersRef.current.add(timer);
      } else {
        dispatch({ type: "fail", id: item.id, error: batchUploadError(err) });
      }
    } finally {
      runningRef.current.delete(item.id);
      controllersRef.current.delete(item.id);
      setTick((t) => t + 1);
    }
  }, []);

  // Orchestration: whenever the queue changes (a row settled, was retried, or the
  // backoff timer fired), start as many queued rows as the concurrency cap allows.
  useEffect(() => {
    if (!started) return;
    if (Date.now() < backoffUntilRef.current) return;
    const startable = selectStartable(items, MAX_CONCURRENT_UPLOADS).filter(
      (item) => !runningRef.current.has(item.id),
    );
    for (const item of startable) {
      runningRef.current.add(item.id);
      const controller = new AbortController();
      controllersRef.current.set(item.id, controller);
      void runOne(item, controller);
    }
  }, [items, started, runOne]);

  // Abort every in-flight upload + clear pending timers on unmount.
  useEffect(() => {
    const controllers = controllersRef.current;
    const timers = timersRef.current;
    return () => {
      for (const c of controllers.values()) c.abort();
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  function cancelRow(id: string) {
    controllersRef.current.get(id)?.abort();
  }

  function cancelAll() {
    for (const c of controllersRef.current.values()) c.abort();
    for (const it of itemsRef.current) {
      if (it.status === "queued") dispatch({ type: "cancel", id: it.id });
    }
  }

  const uploadableCount = items.filter((it) => it.status === "queued").length;
  const settled = items.length > 0 && allSettled(items);
  const doneCount = items.filter((it) => it.status === "done").length;
  const failedCount = items.filter(
    (it) => it.status === "failed" || it.status === "cancelled",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-fg">
          {items.length} {items.length === 1 ? "file" : "files"} ready to upload
        </p>
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          Each file uploads as its own video with the title below. They upload{" "}
          {MAX_CONCURRENT_UPLOADS} at a time — the rest wait in the queue. Add details to each
          video afterward in Your videos.
        </p>
      </div>

      {/* Shared channel + privacy for the whole batch (locked once uploading). */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {channels.length > 1 ? (
          <div className="sm:flex-1">
            <Select
              label="Channel"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-label="Batch channel"
              disabled={started}
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.handle}>
                  {ch.display_name} (@{ch.handle})
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="sm:flex-1">
          <Select
            label="Privacy"
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
            aria-label="Batch privacy"
            disabled={started}
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </Select>
        </div>
      </div>

      <ul aria-label="Upload queue" className="flex flex-col gap-2">
        {items.map((it) => (
          <BatchRow
            key={it.id}
            item={it}
            editable={!started || it.status === "queued"}
            onTitle={(title) => dispatch({ type: "setTitle", id: it.id, title })}
            onCancel={() => cancelRow(it.id)}
            onRetry={() => {
              dispatch({ type: "retry", id: it.id });
              setTick((t) => t + 1);
            }}
            onRemove={() => dispatch({ type: "remove", id: it.id })}
          />
        ))}
      </ul>

      {settled ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-fg-muted">
            {doneCount > 0
              ? `${doneCount} ${doneCount === 1 ? "video" : "videos"} uploaded.`
              : "No videos were uploaded."}
            {failedCount > 0 ? ` ${failedCount} didn’t finish — retry above or remove them.` : ""}
          </p>
          <div>
            <Button onClick={onClearBatch}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {started ? (
            <Button variant="secondary" onClick={cancelAll}>
              Cancel all
            </Button>
          ) : (
            <>
              <button
                type="button"
                disabled={uploadableCount === 0}
                onClick={() => setStarted(true)}
                className="focus-ring rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Upload {uploadableCount} {uploadableCount === 1 ? "video" : "videos"}
              </button>
              <Button variant="secondary" onClick={onClearBatch}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BatchRow({
  item,
  editable,
  onTitle,
  onCancel,
  onRetry,
  onRemove,
}: {
  item: BatchItem;
  editable: boolean;
  onTitle: (title: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const showBar = item.status === "uploading" || item.status === "done";
  const percent = item.status === "done" ? 100 : item.percent;

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface px-3.5 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <input
          value={item.title}
          onChange={(e) => onTitle(e.target.value)}
          aria-label={`Title for ${item.file.name}`}
          maxLength={200}
          disabled={!editable}
          className={FIELD}
        />
        <StatusPill status={item.status} />
      </div>
      <p className="truncate text-[12.5px] text-fg-muted">
        {item.file.name} · {formatBytes(item.total)}
      </p>
      {showBar ? (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={`Upload progress for ${item.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong"
          >
            <div
              className="h-full rounded-full bg-fg transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-[12.5px] text-fg-muted">
            {formatBytes(item.loaded)} of {formatBytes(item.total)}
          </span>
        </div>
      ) : null}
      {item.status === "over_quota" ? (
        <p className="text-xs text-warning">
          This file would exceed your storage quota. Free up space, then retry — or remove it.
        </p>
      ) : null}
      {item.error ? <p className="text-xs text-danger">{item.error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {item.status === "uploading" ? (
          <>
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted"
            >
              <LoaderIcon size={16} className="animate-spin" aria-hidden="true" />
              Uploading…
            </span>
            <Button
              variant="danger-outline"
              size="sm"
              aria-label={`Cancel ${item.file.name}`}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </>
        ) : item.status === "done" ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-success">
            <CheckIcon size={15} aria-hidden="true" />
            {item.videoId ? (
              <Link href={`/videos/${item.videoId}`} className="font-semibold underline">
                View video
              </Link>
            ) : (
              "Uploaded"
            )}
          </span>
        ) : item.status === "failed" || item.status === "cancelled" ? (
          <>
            <Button size="sm" aria-label={`Retry ${item.file.name}`} onClick={onRetry}>
              Retry
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Remove ${item.file.name}`}
              onClick={onRemove}
            >
              Remove
            </Button>
          </>
        ) : (
          // queued or over_quota
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Remove ${item.file.name}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
    </li>
  );
}
