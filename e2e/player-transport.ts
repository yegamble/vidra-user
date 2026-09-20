// Shared assertion for the player's transport control. Not a spec (the runner's
// testMatch only collects *.spec.ts), just the one invariant two specs need.
import type { Page } from "@playwright/test";

/**
 * The transport control (the first button in the bar) is the viewer's ONLY
 * readout of whether the video is playing — and the media element can leave
 * playback WITHOUT firing `pause`: the load algorithm that runs on every engine
 * re-attach (hls.js detachMedia, the HLS→original fallback, an IPFS switch, a
 * retry) pauses it silently and rejects any pending play promise.
 *
 * Both halves are read in ONE evaluate so the comparison is of the same instant,
 * and returned as a single string so `expect.poll(...).toMatch(TRANSPORT_AGREES)`
 * retries until the label has converged on the element's truth.
 */
export async function transportVsElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector("video");
    const label =
      document
        .querySelector('[data-testid="player-controls"]')
        ?.querySelector("button")
        ?.getAttribute("aria-label") ?? "(no control)";
    return `${label} / element ${el?.paused === false ? "playing" : "paused"}`;
  });
}

export const TRANSPORT_AGREES = /^(Play \/ element paused|Pause \/ element playing)$/;
