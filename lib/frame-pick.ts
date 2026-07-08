// Pure helpers for the studio thumbnail frame-pick (UPLOAD-04). The scrubber in
// ThumbnailManager seeks a preview (storyboard sprite when present, else a muted
// <video>) and POSTs {at_seconds} to the thumbnail endpoint, which extracts that
// exact frame server-side. These helpers keep the scrub state/bounds and the
// endpoint's typed-error mapping out of the component so they can be unit-tested.

import { ApiError, errorMessage } from "@/lib/api";

/**
 * The backend accepts at_seconds in the half-open range [0, duration). This
 * epsilon keeps a scrub parked at the very end strictly below duration so the
 * last frame never answers 422 (fractional seconds are allowed).
 */
export const FRAME_PICK_EPSILON = 0.1;

/**
 * canFramePick reports whether a video can be frame-picked from at all: a known,
 * finite, positive duration proves it has a processed, probed original (duration
 * is only recorded after the media probe runs). Without one the frame-pick
 * affordance is hidden — the endpoint would only 409, so offering it would lie.
 */
export function canFramePick(durationSeconds: number | undefined | null): boolean {
  return (
    durationSeconds !== undefined &&
    durationSeconds !== null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  );
}

/**
 * clampFrameTime constrains a scrub timestamp to the [0, duration) range the
 * frame-pick endpoint accepts. An unknown/zero/negative or non-finite duration
 * yields 0 (the only always-valid frame); a non-finite or negative input clamps
 * to 0; a value at or past the end is pulled just below duration by one epsilon.
 */
export function clampFrameTime(
  seconds: number,
  durationSeconds: number | undefined | null,
): number {
  if (!canFramePick(durationSeconds)) return 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const max = Math.max(0, (durationSeconds as number) - FRAME_PICK_EPSILON);
  return Math.min(seconds, max);
}

/**
 * frameThumbnailError maps the frame-pick endpoint's typed failures to a safe,
 * human sentence. 409 = the original is not processed yet, 422 = out of range
 * (guarded by clampFrameTime but handled defensively), 503 = no server-side
 * extractor on this instance. Anything else falls through to the shared
 * error-message formatter.
 */
export function frameThumbnailError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return "This video is still processing. Pick a frame once it has finished.";
    }
    if (err.status === 422) {
      return "That moment is outside the video. Pick a point within its length.";
    }
    if (err.status === 503) {
      return "Picking a frame from the video isn’t available on this instance.";
    }
  }
  return errorMessage(err, "Could not set the thumbnail from that frame.");
}
