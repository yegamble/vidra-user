"use client";

/*
 * The viewer's volume, remembered per DEVICE.
 *
 * Speed is a session preference on purpose (lib/player-rates.ts stores it in
 * sessionStorage — a rate you picked for one binge should not follow you into
 * next week). Volume is not that: it is a property of the room you are in and
 * the hardware you are on, which is why every player people already use — and
 * YouTube in particular — carries it across reloads and tabs. A40 measured the
 * old behaviour: a viewer who turned it down watched the very next page open at
 * full blast.
 *
 * localStorage, therefore, not sessionStorage; and a write on every
 * `volumechange`, so the keyboard shortcut, the slider and the mute toggle all
 * persist without any of them knowing about this module.
 */

const VOLUME_KEY = "vidra.player.volume";
const MUTED_KEY = "vidra.player.muted";
const VOLUME_EVENT = "vidra:player-volume";

export type StoredVolume = { volume: number; muted: boolean };

export const DEFAULT_VOLUME: StoredVolume = { volume: 1, muted: false };

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/** subscribeVolume notifies on a change here or in another tab. */
export function subscribeVolume(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(VOLUME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VOLUME_EVENT, onChange);
  };
}

/** The SSR snapshot: always the baked default, so hydration cannot disagree. */
export function serverVolume(): StoredVolume {
  return DEFAULT_VOLUME;
}

/**
 * readStoredVolume returns the remembered level, or the default when nothing is
 * stored, the value is corrupt, or storage is unavailable (private mode).
 */
export function readStoredVolume(): StoredVolume {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const muted = window.localStorage.getItem(MUTED_KEY) === "true";
    if (raw === null) return { volume: DEFAULT_VOLUME.volume, muted };
    const n = Number(raw);
    return { volume: Number.isFinite(n) ? clamp(n) : DEFAULT_VOLUME.volume, muted };
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** storeVolume remembers the level and broadcasts it to every player in the tab. */
export function storeVolume(volume: number, muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOLUME_KEY, String(clamp(volume)));
    window.localStorage.setItem(MUTED_KEY, String(muted));
  } catch {
    /* storage disabled — the level still applies to this player */
  }
  window.dispatchEvent(new Event(VOLUME_EVENT));
}
