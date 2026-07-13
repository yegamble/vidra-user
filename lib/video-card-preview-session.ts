"use client";

import { useSyncExternalStore } from "react";

// Inline previews start muted. Once a viewer explicitly unmutes one preview,
// remember that choice for the rest of this browser tab so the next hovered
// card can continue with sound. sessionStorage intentionally resets when the
// tab/session ends; this is not an account preference and never leaks between
// signed-in users sharing a browser profile.
export const VIDEO_CARD_PREVIEW_AUDIO_KEY = "vidra.video-card-preview.audio";
const CHANGE_EVENT = "vidra:video-card-preview-audio";
let memoryMuted = true;

export function readVideoCardPreviewMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.sessionStorage.getItem(VIDEO_CARD_PREVIEW_AUDIO_KEY);
    memoryMuted = stored !== "audible";
    return memoryMuted;
  } catch {
    return memoryMuted;
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === VIDEO_CARD_PREVIEW_AUDIO_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useVideoCardPreviewMuted(): boolean {
  return useSyncExternalStore(subscribe, readVideoCardPreviewMuted, () => true);
}

export function setVideoCardPreviewMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  memoryMuted = muted;
  try {
    window.sessionStorage.setItem(VIDEO_CARD_PREVIEW_AUDIO_KEY, muted ? "muted" : "audible");
  } catch {
    // Storage can be unavailable in privacy-restricted contexts. The current
    // preview still updates its media element; only cross-card persistence is
    // lost in that case.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Reset tab-scoped audio consent when an authenticated browsing session ends. */
export function resetVideoCardPreviewAudio(): void {
  memoryMuted = true;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(VIDEO_CARD_PREVIEW_AUDIO_KEY);
  } catch {
    // The in-memory reset still protects the next account in this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
