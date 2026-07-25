"use client";

import { useSyncExternalStore } from "react";

import type { Video } from "@/lib/api";

const STORAGE_KEY = "vidra.playback-queue.v1";
const MAX_QUEUE_LENGTH = 100;
const EMPTY_QUEUE: readonly Video[] = [];

let snapshot: readonly Video[] | null = null;
const listeners = new Set<() => void>();

function validVideo(value: unknown): value is Video {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Video>;
  return typeof item.id === "string" && item.id !== "" && typeof item.title === "string";
}

function readQueue(): readonly Video[] {
  if (snapshot) return snapshot;
  if (typeof window === "undefined") return EMPTY_QUEUE;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    snapshot = Array.isArray(parsed) ? parsed.filter(validVideo).slice(0, MAX_QUEUE_LENGTH) : [];
  } catch {
    snapshot = [];
  }
  return snapshot;
}

function emit(next: readonly Video[]) {
  snapshot = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A private-browsing/storage-quota failure still leaves the queue usable
      // for this page load through the in-memory snapshot.
    }
  }
  listeners.forEach((listener) => listener());
}

/** Add a video to the end of the playback queue, idempotently. */
export function enqueueVideo(video: Video): boolean {
  const current = readQueue();
  if (current.some((item) => item.id === video.id && item.remote === video.remote)) return false;
  // Keep the newest request when the bounded queue is full by evicting the
  // oldest item; returning true must always mean the supplied video is present.
  emit([...current, video].slice(-MAX_QUEUE_LENGTH));
  return true;
}

/** Remove one queued video after it becomes the current watch-page item. */
export function dequeueVideo(videoId: string, remote = false): void {
  const current = readQueue();
  const next = current.filter((item) => item.id !== videoId || Boolean(item.remote) !== remote);
  if (next.length !== current.length) emit(next);
}

/** Remove one queued video the viewer explicitly dropped from the up-next panel.
 * Same persistence + cross-tab broadcast as the other mutators; a no-op (no
 * write, no notify) when the id/locality pair is not present. */
export function removeVideo(videoId: string, remote = false): void {
  const current = readQueue();
  const next = current.filter((item) => item.id !== videoId || Boolean(item.remote) !== remote);
  if (next.length !== current.length) emit(next);
}

/** Empty the whole playback queue (the up-next panel's Clear-all). A no-op when
 * the queue is already empty, so it never rewrites storage or renotifies. */
export function clearQueue(): void {
  if (readQueue().length === 0) return;
  emit([]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    snapshot = null;
    listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reactive queue snapshot shared by card actions and the watch-page end card. */
export function useVideoQueue(): readonly Video[] {
  return useSyncExternalStore(subscribe, readQueue, () => EMPTY_QUEUE);
}

/** Test-only reset for deterministic queue tests. */
export function resetVideoQueueForTests(): void {
  snapshot = null;
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}
