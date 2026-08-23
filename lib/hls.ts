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
 * A parsed hls.js level, as much of it as the quality menu reads: the rendition
 * height and the codec family (hls.js's `Level.codecSet` — the 4-char video and
 * audio codec prefixes, e.g. "avc1,mp4a" / "hvc1,mp4a" / "av01,mp4a"). Both are
 * optional so a level list from a test/mock without codec info still fits.
 */
export interface MenuLevel {
  height?: number;
  codecSet?: string;
}

/**
 * activeCodecSet names the codec family the quality menu must stay inside, or
 * null when there is nothing to restrict — a single-codec master (or a level
 * list carrying no codec info at all), where every level is a candidate exactly
 * as before. `activeLevel` is the hls.js index of the rung actually playing
 * (AUTO_LEVEL / out of range when not known yet).
 */
function activeCodecSet(levels: MenuLevel[], activeLevel: number): string | null {
  const families = new Set<string>();
  for (const l of levels) if (l.codecSet) families.add(l.codecSet);
  if (families.size < 2) return null;
  const active = levels[activeLevel]?.codecSet;
  if (active) return active;
  // The active rung is not known yet (pre-manifest, or a caller that does not
  // track it). hls.js sorts its PREFERRED codec last within a height group, so
  // the final level names the family it will settle on.
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const codecSet = levels[i]?.codecSet;
    if (codecSet) return codecSet;
  }
  return null;
}

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
 * IS the value assigned to hls.currentLevel/nextLevel) to the quality menu:
 * Auto first, then one entry per distinct rendition height, tallest first.
 * Levels without a height (audio-only/malformed) are skipped. An empty/unusable
 * level list yields an empty menu (no selector).
 *
 * MULTI-CODEC MASTERS. A master may carry the same ladder in several codec
 * families (H.264 + HEVC + AV1) as one flat variant list. hls.js re-sorts levels
 * by height ascending and then by ITS OWN codec preference (utils/codecs.ts —
 * lower preference value sorts LAST: hvc1 0.75, av01 0.8, avc1 1), with average
 * bitrate only as the final tiebreak. So across families the index order is not
 * bitrate order, and "the last index at this height" is merely whichever codec
 * hls.js prefers. hls.js's ABR meanwhile never leaves the family it is playing
 * (abr-controller skips candidates whose codecSet differs), so a menu built
 * across families would let a manual "720p" force a cross-codec switch (a
 * changeType re-init) that ABR itself would never make.
 *
 * Therefore, when more than one codecSet is present the menu is built ONLY from
 * the levels of the ACTIVE family: `activeLevel` — hls.js's `firstLevel` at
 * MANIFEST_PARSED, then the level of each LEVEL_SWITCHED — names it, so the menu
 * follows the engine's codec choice and every manual pick stays inside it.
 *
 * SINGLE-CODEC MASTERS (and level lists with no codec info) are unchanged: every
 * level is a candidate, and since within one family hls.js's final sort key is
 * average bitrate ascending, the later (higher-bitrate) index still wins a
 * height tie.
 */
export function buildLevelMenu(
  levels: MenuLevel[],
  activeLevel: number = AUTO_LEVEL,
): LevelOption[] {
  const family = activeCodecSet(levels, activeLevel);
  const byHeight = new Map<number, number>();
  levels.forEach((l, i) => {
    if (family !== null && l.codecSet !== family) return;
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
