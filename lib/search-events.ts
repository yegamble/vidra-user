"use client";

// Best-effort behavioural-event queue for search/discovery telemetry.
//
// The autocomplete, results page, home rails, and watch page emit small events
// (a suggestion was shown, a result was clicked, a video was seen) that the
// search service learns from. This module batches them and POSTs to
// /api/v1/search/events so we make at most one request per interval instead of
// one per interaction.
//
// Contract & guarantees:
//   - Batches are capped at 20 events (the endpoint's maxItems). A full batch
//     flushes immediately; otherwise a flush is scheduled `FLUSH_INTERVAL_MS`
//     out and on `visibilitychange`→hidden / `pagehide` (sendBeacon-style, with
//     fetch keepalive so an unload doesn't drop the batch).
//   - Fire-and-forget: a failed POST drops the batch SILENTLY. Telemetry must
//     never surface an error, retry-storm, or block the UI.
//   - Privacy: the client sends only what the caller passes (ids, positions,
//     counts, and the user's own search term). It does NOT gate on the user's
//     personalization/history prefs — vidra-core is the single policy authority
//     and strips/attributes per the effective flags. The frontend never decides.
//   - SSR-safe: on the server every function no-ops (no window, no queue).

import { api } from "@/lib/api";
import type { SearchEventInput } from "@/lib/api/types";
import { logger } from "@/lib/logger";

const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 5_000;

let queue: SearchEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

// --- "the batched write landed" signal --------------------------------------
//
// A `search.submitted` event is the only thing this queue carries that WRITES to
// the caller's stored search history (that ingest path is the one that sets
// `allow_history` — see lib/search-session.ts). A search is submitted on the
// results page, but its event does not leave the browser until this queue
// flushes — up to FLUSH_INTERVAL_MS later, and asynchronously after that, since
// core answers POST /search/events with 202 and never blocks on the search
// service. Anything that reads the history immediately (the "Search &
// recommendations" page, reached by a client-side nav straight after a search)
// therefore reads it BEFORE the write it is meant to show, and with no other
// signal to go on would stay stale until a manual reload.
//
// So: notify anyone who cares once a batch that CONTAINED a submitted search has
// been accepted by the server. It is a bare edge — it carries no data and issues
// no request itself; a listener decides what to re-read. Fired on SUCCESS only:
// a dropped batch changed nothing on the server, so there is nothing to reflect.
type HistoryFlushListener = () => void;
const historyFlushListeners = new Set<HistoryFlushListener>();

/**
 * subscribeSearchHistoryFlushed registers `listener`, invoked after a flushed
 * batch that contained a `search.submitted` event has been accepted by the
 * server. Returns an unsubscribe function. This is the seam the search-history
 * surface uses to refresh once the batched write lands instead of reading only
 * on mount; it is edge-triggered by a real search, never a timer or a poll.
 */
export function subscribeSearchHistoryFlushed(listener: HistoryFlushListener): () => void {
  historyFlushListeners.add(listener);
  return () => {
    historyFlushListeners.delete(listener);
  };
}

function notifyHistoryFlushed(): void {
  for (const listener of historyFlushListeners) {
    try {
      listener();
    } catch {
      // A listener must never break the best-effort telemetry pipeline.
    }
  }
}

function bindLifecycleListeners(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  // Flush what we have when the tab is backgrounded or unloaded. keepalive keeps
  // the request alive across the transition. `visibilitychange` is the reliable
  // signal on mobile (pagehide/beforeunload are unreliable there); pagehide
  // covers desktop tab close / navigation.
  const onHide = () => {
    if (document.visibilityState === "hidden") flush({ keepalive: true });
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flush({ keepalive: true }));
}

function scheduleFlush(): void {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

/**
 * trackSearchEvent enqueues one behavioural event. A full batch (20) flushes at
 * once; a partial batch is flushed on the next interval tick or page-hide. No-op
 * on the server. Never throws.
 */
export function trackSearchEvent(event: SearchEventInput): void {
  if (typeof window === "undefined") return;
  bindLifecycleListeners();
  queue.push(event);
  if (queue.length >= MAX_BATCH) {
    flush();
  } else {
    scheduleFlush();
  }
}

/**
 * flush sends up to 20 queued events now and clears the timer. Drops the batch
 * silently on any error. `keepalive` uses fetch keepalive so the request
 * survives a page unload. Exported so tests (and the page-hide handler) can force
 * a flush; ordinary callers use trackSearchEvent.
 */
export function flush(opts: { keepalive?: boolean } = {}): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  // Only a submitted search writes to the caller's search history; if this batch
  // carries one, wake the history surface once the write has been accepted.
  const affectsHistory = batch.some((event) => event.type === "search.submitted");
  void api
    .postSearchEvents(batch, { keepalive: opts.keepalive })
    .then(() => {
      if (affectsHistory) notifyHistoryFlushed();
    })
    .catch((err: unknown) => {
      // Telemetry is best-effort: swallow. Log at debug for local diagnosis only.
      logger.debug("search events flush failed", {
        dropped: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  // If more than one batch is queued, keep draining on the next tick.
  if (queue.length > 0) scheduleFlush();
}

/**
 * resetSearchEventsForTest clears the in-memory queue and pending timer. Test-only
 * helper so specs start from a clean queue.
 */
export function resetSearchEventsForTest(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue = [];
}
