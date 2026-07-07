// Pure HLS playback decision + quality-menu helpers. No React, no hls.js — the
// runtime wiring lives in lib/use-hls-playback.ts; these stay unit-testable.

/**
 * How a video should be played:
 * - "hls-js"     — the master playlist via hls.js over MSE (quality selectable).
 * - "native-hls" — the master playlist straight into <video src> (Safari/iOS
 *                  without MSE; the browser owns quality/ABR).
 * - "original"   — the progressive Range-capable /original file (no transcode
 *                  ready, or no HLS support at all).
 */
export type PlaybackMode = "hls-js" | "native-hls" | "original";

/** One entry of the quality menu. level -1 is Auto (hls.js ABR). */
export interface LevelOption {
  level: number;
  label: string;
}

/** The hls.js level index meaning "Auto" (adaptive bitrate selection). */
export const AUTO_LEVEL = -1;

/**
 * canPlayNativeHls reports whether a media element claims native HLS support
 * (canPlayType is "maybe"/"probably" for the Apple HLS MIME type). True on
 * Safari; some Chromium builds also claim it, which is why hls.js is still
 * preferred whenever MSE exists (see choosePlaybackMode).
 */
export function canPlayNativeHls(el: { canPlayType(type: string): string }): boolean {
  return el.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/**
 * choosePlaybackMode picks how to play a video. hls.js (MSE) is preferred over
 * native HLS even where both work — it is the only path that exposes manual
 * quality selection — so native is effectively the iOS-Safari fallback (no
 * MSE). Without an hls_url, or with no HLS capability at all, the original
 * progressive file plays as before.
 */
export function choosePlaybackMode(input: {
  hasHls: boolean;
  mseSupported: boolean;
  nativeHls: boolean;
}): PlaybackMode {
  if (!input.hasHls) return "original";
  if (input.mseSupported) return "hls-js";
  if (input.nativeHls) return "native-hls";
  return "original";
}

/**
 * buildLevelMenu maps hls.js's parsed levels (index order preserved — the index
 * IS the value assigned to hls.currentLevel) to the quality menu: Auto first,
 * then one entry per distinct rendition height, tallest first. hls.js orders
 * levels by ascending bitrate, so when two levels share a height the later
 * (higher-bitrate) index wins. Levels without a height (audio-only/malformed)
 * are skipped. An empty/unusable level list yields an empty menu (no selector).
 */
export function buildLevelMenu(levels: Array<{ height?: number }>): LevelOption[] {
  const byHeight = new Map<number, number>();
  levels.forEach((l, i) => {
    if (typeof l.height === "number" && l.height > 0) byHeight.set(l.height, i);
  });
  if (byHeight.size === 0) return [];
  const entries = [...byHeight.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([height, level]) => ({ level, label: `${height}p` }));
  return [{ level: AUTO_LEVEL, label: "Auto" }, ...entries];
}

/**
 * qualityLabel renders the quality menu-button's label from the current
 * selection state, matching the smooth-switch (hls.nextLevel + LEVEL_SWITCHED)
 * pending model in use-hls-playback:
 * - a manual pick not yet confirmed by LEVEL_SWITCHED shows the target rung with
 *   a trailing ellipsis ("720p…") — the "busy" state the spec requires;
 * - once confirmed (or picked while ABR was already there) it shows that rung;
 * - on Auto it shows "Auto", or "Auto (720p)" when the active ABR rung height is
 *   known (from the last LEVEL_SWITCHED).
 * `selected` / `active` are hls.js level indices (AUTO_LEVEL = -1); `activeHeight`
 * is the pixel height of the active rung (null when unknown, e.g. pre-manifest or
 * in a mocked run where no fragment ever loads).
 */
export function qualityLabel(opts: {
  levels: LevelOption[];
  selected: number;
  activeHeight: number | null;
  pending: boolean;
}): string {
  const { levels, selected, activeHeight, pending } = opts;
  const labelOf = (level: number): string =>
    levels.find((l) => l.level === level)?.label ?? "Auto";
  if (selected === AUTO_LEVEL) {
    return activeHeight && activeHeight > 0 ? `Auto (${activeHeight}p)` : "Auto";
  }
  const base = labelOf(selected);
  return pending ? `${base}…` : base;
}
