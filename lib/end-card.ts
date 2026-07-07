// End-card / autoplay-next helpers (PLAY-08). Pure module — no React — so the
// next-selection, routing and announcement logic is unit-tested in isolation
// (lib/end-card.test.ts) and shared by the EndCard component + the player shell.

import type { Video } from "@/lib/api";

/** Default autoplay-next countdown length, in seconds (PLAY-08). */
export const END_CARD_COUNTDOWN_SECONDS = 8;

/**
 * pickNextVideo returns the video the end card queues up next: the first entry
 * of the already-fetched related list (playlist context is a recorded non-goal
 * this wave). null when there is nothing to play next — the card then degrades
 * to a plain replay affordance with no countdown.
 */
export function pickNextVideo(related: readonly Video[] | null | undefined): Video | null {
  return related && related.length > 0 ? related[0] : null;
}

/**
 * nextVideoHref is the client-side route the end card navigates to. A remote
 * card lives under /remote/{id}; a local one under /videos/{id} — mirroring
 * RelatedRow's own linking so a remote "next" is never sent to the local route.
 */
export function nextVideoHref(video: Video): string {
  return video.remote === true ? `/remote/${video.id}` : `/videos/${video.id}`;
}

/**
 * countdownAnnouncement is the polite live-region text announced while the
 * autoplay countdown runs ("Playing next in 8 seconds"; singular at 1). Negative
 * / fractional inputs are clamped and rounded so the announcement is always a
 * clean whole-second count.
 */
export function countdownAnnouncement(seconds: number): string {
  const n = Math.max(0, Math.round(seconds));
  return `Playing next in ${n} ${n === 1 ? "second" : "seconds"}`;
}
