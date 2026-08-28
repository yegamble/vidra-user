// Pure state for the studio's BATCH upload queue (UPLOAD-10 / W2.U4).
//
// The batch UX drops several files at once, each becoming a queued row that
// uploads through the SAME per-video resumable protocol as a single upload
// (create draft → open session → PUT chunks → complete). This module is the pure,
// framework-free core the queue component drives: the item shape, the reducer of
// per-item transitions, and the two policy selectors —
//   • selectStartable — bounded client-side parallelism (at most N concurrent
//     resumable sessions; the rest wait as `queued`), and
//   • overQuotaIds — the quota preflight (mark rows that would exceed the caller's
//     storage quota BEFORE any bytes move, greedily fitting in drop order).
// Keeping this pure makes the parallelism / retry / limit-backoff / preflight
// behaviour unit-testable without a DOM or a backend (see upload-queue.test.ts);
// the component only adds the async orchestration + rendering on top.

import type { QuotaStatus } from "@/lib/api";

/**
 * A single file's lifecycle in the batch queue:
 *  - queued      waiting for a free upload slot (the start-when-idle default)
 *  - uploading   an in-flight resumable session (progress ticks)
 *  - done        completed + finalised (the video exists)
 *  - failed      a terminal error (retryable via `retry`)
 *  - cancelled   the creator aborted it (retryable via `retry`)
 *  - over_quota  the preflight marked it as exceeding the storage quota (never
 *                started; the creator frees space or removes it)
 */
import type { UploadPhase } from "@/lib/api";

export type BatchItemStatus =
  | "queued"
  | "uploading"
  | "done"
  | "failed"
  | "cancelled"
  | "over_quota";

/** One file's row in the batch upload queue. */
export interface BatchItem {
  /** Stable client-side id (not the server video id). */
  id: string;
  /** The picked file (held in memory for the session — a reload loses it). */
  file: File;
  /** Editable per-file title, prefilled from the filename. */
  title: string;
  status: BatchItemStatus;
  /** Bytes transferred so far (server-driven, chunk-accurate). */
  loaded: number;
  /** Total bytes to send (the file size). */
  total: number;
  /** Whole-number 0–100 progress. */
  percent: number;
  /**
   * Which half of the upload the row is in. "processing" starts the moment the
   * last chunk lands and the server takes over (assembly, storage, probe) — work
   * that has no byte counter, so the row must say so instead of sitting at a
   * stalled 100%. Absent until the first progress event.
   */
  phase?: UploadPhase;
  /** The finalised video id once done (for the "View" link). */
  videoId?: string;
  /** A safe, user-facing message for a failed row. */
  error?: string;
}

/**
 * The max resumable sessions the client opens at once — bounded parallelism so a
 * big batch neither floods the network nor trips the server's per-user active
 * session cap on the very first files (that cap is still handled: a 429
 * `too_many_active_uploads` re-queues the row, see the component). The server's
 * instance default is 5; staying at 2 leaves headroom for other tabs/devices.
 */
export const MAX_CONCURRENT_UPLOADS = 2;

/**
 * titleFromFilename derives a friendly default title from a filename by dropping
 * a single trailing extension ("alps-diary.mov" → "alps-diary"); a dotfile or an
 * extension-less name is returned unchanged, and a blank falls back to "Untitled".
 */
export function titleFromFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "Untitled";
  const dot = trimmed.lastIndexOf(".");
  // dot > 0 avoids stripping a leading-dot name (".mp4" stays ".mp4").
  return dot > 0 ? trimmed.slice(0, dot) : trimmed;
}

let idSeq = 0;
/** Reset the id counter — test-only, to make makeBatchItems deterministic. */
export function resetBatchIdSeq(): void {
  idSeq = 0;
}

/**
 * makeBatchItems builds the initial queued rows for a set of picked files. Ids are
 * generated with a monotonic counter so they stay stable and unique within a
 * session (crypto is not needed — these never leave the client).
 */
export function makeBatchItems(files: File[]): BatchItem[] {
  return files.map((file) => ({
    id: `batch-${idSeq++}`,
    file,
    title: titleFromFilename(file.name),
    status: "queued" as const,
    loaded: 0,
    total: file.size,
    percent: 0,
  }));
}

export type QueueAction =
  | { type: "enqueue"; items: BatchItem[] }
  | { type: "setTitle"; id: string; title: string }
  | { type: "start"; id: string }
  | {
      type: "progress";
      id: string;
      loaded: number;
      total: number;
      percent: number;
      phase?: UploadPhase;
    }
  | { type: "succeed"; id: string; videoId: string }
  | { type: "fail"; id: string; error: string }
  // `requeue` returns an in-flight row to `queued` WITHOUT marking it failed —
  // the limit-backoff path when the server answers too_many_active_uploads.
  | { type: "requeue"; id: string }
  | { type: "cancel"; id: string }
  | { type: "retry"; id: string }
  | { type: "remove"; id: string }
  // `markOverQuota` flags the given (still-queued) rows as exceeding the quota.
  | { type: "markOverQuota"; ids: string[] };

function update(state: BatchItem[], id: string, patch: Partial<BatchItem>): BatchItem[] {
  return state.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

/**
 * queueReducer applies one transition to the queue. It is a pure function of the
 * current items + the action — all timing, concurrency, and I/O live in the
 * component. Transitions are guarded so an action for the wrong current status is
 * a no-op (e.g. progress on a done row, or requeue on a queued row).
 */
export function queueReducer(state: BatchItem[], action: QueueAction): BatchItem[] {
  switch (action.type) {
    case "enqueue": {
      // Append, skipping any id already present (idempotent seeding).
      const known = new Set(state.map((it) => it.id));
      const fresh = action.items.filter((it) => !known.has(it.id));
      return fresh.length > 0 ? [...state, ...fresh] : state;
    }
    case "setTitle": {
      // Editable while the row has not started (or after it settled); never
      // rename an in-flight or completed upload.
      const it = state.find((x) => x.id === action.id);
      if (!it || it.status === "uploading" || it.status === "done") return state;
      return update(state, action.id, { title: action.title });
    }
    case "start": {
      const it = state.find((x) => x.id === action.id);
      if (!it || it.status !== "queued") return state;
      return update(state, action.id, {
        status: "uploading",
        percent: 0,
        loaded: 0,
        error: undefined,
      });
    }
    case "progress": {
      const it = state.find((x) => x.id === action.id);
      if (!it || it.status !== "uploading") return state;
      return update(state, action.id, {
        loaded: action.loaded,
        total: action.total,
        percent: action.percent,
        phase: action.phase ?? "uploading",
      });
    }
    case "succeed": {
      const it = state.find((x) => x.id === action.id);
      if (!it) return state;
      return update(state, action.id, {
        status: "done",
        percent: 100,
        loaded: it.total,
        videoId: action.videoId,
        error: undefined,
      });
    }
    case "fail":
      return update(state, action.id, { status: "failed", error: action.error });
    case "requeue": {
      // Limit backoff: only an in-flight row returns to the queue (not failed).
      const it = state.find((x) => x.id === action.id);
      if (!it || it.status !== "uploading") return state;
      return update(state, action.id, {
        status: "queued",
        percent: 0,
        loaded: 0,
        error: undefined,
      });
    }
    case "cancel":
      return update(state, action.id, { status: "cancelled" });
    case "retry": {
      const it = state.find((x) => x.id === action.id);
      if (!it || (it.status !== "failed" && it.status !== "cancelled")) return state;
      return update(state, action.id, {
        status: "queued",
        percent: 0,
        loaded: 0,
        error: undefined,
      });
    }
    case "remove":
      return state.filter((it) => it.id !== action.id);
    case "markOverQuota": {
      const ids = new Set(action.ids);
      return state.map((it) =>
        ids.has(it.id) && it.status === "queued" ? { ...it, status: "over_quota" } : it,
      );
    }
    default:
      return state;
  }
}

/** activeCount is how many rows are currently uploading (hold a session slot). */
export function activeCount(items: BatchItem[]): number {
  return items.reduce((n, it) => n + (it.status === "uploading" ? 1 : 0), 0);
}

/**
 * selectStartable returns the items of the queued rows that may begin NOW, capping
 * total concurrency at `max`: it yields at most `max - activeCount` items, in queue
 * order. Returns [] when the cap is already reached. The component filters out items
 * it has already kicked off (a run in flight before the reducer reflects it).
 */
export function selectStartable(items: BatchItem[], max: number): BatchItem[] {
  const free = Math.max(0, max - activeCount(items));
  if (free === 0) return [];
  const out: BatchItem[] = [];
  for (const it of items) {
    if (it.status === "queued") {
      out.push(it);
      if (out.length === free) break;
    }
  }
  return out;
}

/** allSettled is true when no row is still queued or uploading (batch is finished). */
export function allSettled(items: BatchItem[]): boolean {
  return items.every((it) => it.status !== "queued" && it.status !== "uploading");
}

/**
 * overQuotaIds is the quota preflight: given the caller's storage picture, it
 * greedily fits the still-queued rows in order and returns the ids that would push
 * the projected usage past the quota. An unlimited (null) quota — or no quota
 * loaded — returns [] (nothing pre-blocked; the server stays the final authority
 * via its 422 quota_exceeded). A row that does not fit is skipped from the
 * projection so a smaller later file can still be admitted.
 */
export function overQuotaIds(items: BatchItem[], quota: QuotaStatus | null): string[] {
  if (!quota || quota.quota_bytes == null) return [];
  let projected = quota.used_bytes;
  const over: string[] = [];
  for (const it of items) {
    if (it.status !== "queued") continue;
    if (projected + it.total > quota.quota_bytes) {
      over.push(it.id);
    } else {
      projected += it.total;
    }
  }
  return over;
}
