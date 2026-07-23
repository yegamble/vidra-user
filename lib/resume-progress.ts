// Shared resume-progress math for every "Continue watching" surface (the home
// shelves, the library history grid, the watch-history view). A saved playback
// position turns into a visible resume bar ONLY when it marks a real mid-watch
// spot:
//
//   - past the RESUME_MIN_SECONDS floor — a trivial few seconds is not
//     something a viewer would want to "resume" into (matches the watch-page
//     resume button's lower bound);
//   - below the FINISHED_FRACTION ceiling — a video watched to ~95% is finished
//     (YouTube hides it): no bar, and it drops out of Continue watching.
//
// Centralizing this keeps the finished threshold identical everywhere. Wave C
// also filters finished entries out server-side (GET /me/history?progress=
// in_progress); this client math stays as belt-and-braces and still governs the
// bar on already-fetched cards.

/** Below this many seconds, a saved position is too trivial to be a "resume". */
export const RESUME_MIN_SECONDS = 5;

/** At/above this watched fraction, the video is treated as finished (no bar). */
export const FINISHED_FRACTION = 0.95;

/**
 * The resume-progress fraction (0..1) for a saved position, or null when there
 * is no bar to show: unknown/zero duration, a position below RESUME_MIN_SECONDS,
 * or a finished (>= FINISHED_FRACTION) video. Callers render the bar iff this is
 * non-null and can reuse the value directly as the fill fraction.
 */
export function resumeFraction(
  position: number | null | undefined,
  duration: number | null | undefined,
): number | null {
  if (typeof position !== "number" || position < RESUME_MIN_SECONDS) return null;
  if (typeof duration !== "number" || duration <= 0) return null;
  const fraction = position / duration;
  if (fraction >= FINISHED_FRACTION) return null;
  return fraction;
}

/**
 * Whether a saved position marks the video as finished (>= FINISHED_FRACTION of
 * a known, positive duration). Finished videos leave Continue watching. Distinct
 * from `resumeFraction(...) === null`, which is also null for
 * below-the-floor/unknown-duration positions that should still be resumable.
 */
export function isFinished(
  position: number | null | undefined,
  duration: number | null | undefined,
): boolean {
  return (
    typeof position === "number" &&
    typeof duration === "number" &&
    duration > 0 &&
    position / duration >= FINISHED_FRACTION
  );
}
