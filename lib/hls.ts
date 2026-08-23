// Pure quality-menu helpers. No React, no hls.js — the runtime wiring lives in
// lib/use-playback-engine.ts; these stay unit-testable.
//
// This module is the hls.js side of the engine seam: everything here speaks
// hls.js's parsed level shape on the way IN and engine-neutral QualityIds
// (lib/quality-id.ts) on the way OUT. The level INDEX never escapes — it is
// minted into an id by buildLevelMenu and resolved back by resolveLevelIndex,
// both here, so no caller ever stores one.
//
// Which engine plays at all is a separate question and lives in
// lib/player-engine.ts, because it is not an hls.js question.

import {
  AUTO_QUALITY,
  isAutoQuality,
  qualityKey,
  repIdFromUri,
  type QualityId,
  type QualitySelection,
} from "@/lib/quality-id";

/**
 * One entry of the quality menu.
 * - `id`    — the engine-neutral identity (AUTO_QUALITY for the adaptive entry).
 * - `value` — that id's canonical string form: the menu entry's value and React
 *             key, and the token compared against the current selection.
 * - `label` — what the user reads ("Auto", "720p").
 */
export interface LevelOption {
  value: string;
  id: QualitySelection;
  label: string;
}

/**
 * The value hls.js's own `nextLevel`/`autoLevelCapping` use for "let ABR
 * choose". It is an ENGINE value, written to hls.js and never read back as an
 * identity — AUTO_QUALITY is what the player stores and compares.
 */
export const HLS_AUTO_LEVEL = -1;

/**
 * A parsed hls.js level, as much of it as the quality menu reads: the rendition
 * height, the codec family (hls.js's `Level.codecSet`) and the variant playlist
 * URI (which names the representation on a CMAF tree). All optional so a level
 * list from a test/mock without that info still fits.
 */
export interface MenuLevel {
  height?: number;
  codecSet?: string;
  uri?: string;
}

/**
 * activeCodecFamily names the codec family the quality menu must stay inside, or
 * null when there is nothing to restrict — a single-codec master (or a level
 * list carrying no codec info at all), where every level is a candidate exactly
 * as before. `active` is the family the engine reports itself playing; when it
 * is unknown (or names a family this master does not carry) the preferred-last
 * heuristic below stands in.
 */
function activeCodecFamily(levels: MenuLevel[], active?: string): string | null {
  const families = new Set<string>();
  for (const l of levels) if (l.codecSet) families.add(l.codecSet);
  if (families.size < 2) return null;
  if (active && families.has(active)) return active;
  // The active family is not known yet (pre-manifest, or ABR has not picked).
  // hls.js sorts its PREFERRED codec last within a height group, so the final
  // level names the family it will settle on.
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const codecSet = levels[i]?.codecSet;
    if (codecSet) return codecSet;
  }
  return null;
}

/**
 * qualityIdOfLevel mints the engine-neutral identity of one parsed hls.js level.
 * Returns null for a level with no usable height (audio-only/malformed) — such a
 * level is not selectable and never reaches the menu.
 */
export function qualityIdOfLevel(level: MenuLevel | undefined): QualityId | null {
  if (!level || typeof level.height !== "number" || level.height <= 0) return null;
  const repId = repIdFromUri(level.uri);
  return {
    height: level.height,
    ...(level.codecSet ? { codecFamily: level.codecSet } : {}),
    ...(repId !== undefined ? { repId } : {}),
  };
}

/**
 * buildLevelMenu maps hls.js's parsed levels to the quality menu: Auto first,
 * then one entry per distinct rendition height, tallest first, each carrying the
 * engine-neutral QualityId the caller hands back on selection. Levels without a
 * height (audio-only/malformed) are skipped. An empty/unusable level list yields
 * an empty menu (no selector).
 *
 * MULTI-CODEC MASTERS. A master may carry the same ladder in several codec
 * families (H.264 + HEVC + AV1) as one flat variant list, and ABR never leaves
 * the family it is playing — that is AdaptationSet semantics, which DASH states
 * outright and hls.js implements in its abr-controller by skipping candidates
 * whose codecSet differs. A menu built across families would therefore let a
 * manual "720p" force a cross-codec switch (a changeType re-init) that ABR
 * itself would never make.
 *
 * So when more than one codec family is present the menu is built ONLY from the
 * ACTIVE family: `activeFamily` — the codecSet of the rung the engine reports
 * playing — names it, and every entry's QualityId records it, so a pick can
 * never land outside it however the engine's own list is ordered.
 *
 * SINGLE-CODEC MASTERS (and level lists with no codec info) are unrestricted:
 * every level is a candidate, and where two share a height the LATER one wins —
 * within one family hls.js's final sort key is average bitrate ascending, so
 * that is the higher-bitrate rendition.
 */
export function buildLevelMenu(levels: MenuLevel[], activeFamily?: string): LevelOption[] {
  const family = activeCodecFamily(levels, activeFamily);
  const byHeight = new Map<number, QualityId>();
  for (const level of levels) {
    if (family !== null && level.codecSet !== family) continue;
    const id = qualityIdOfLevel(level);
    if (id) byHeight.set(id.height, id);
  }
  if (byHeight.size === 0) return [];
  const entries = [...byHeight.values()]
    .sort((a, b) => b.height - a.height)
    .map((id) => ({ value: qualityKey(id), id, label: `${id.height}p` }));
  return [{ value: qualityKey(AUTO_QUALITY), id: AUTO_QUALITY, label: "Auto" }, ...entries];
}

/**
 * resolveLevelIndex translates a QualityId back into the hls.js level index to
 * assign — the ONE place an index is produced, and it is written straight to the
 * engine, never stored. Returns null when this level list offers no such
 * rendition (a stale menu, or a rung that only existed in another family), and
 * the caller then leaves playback where it is.
 *
 * A repId, where the tree has one, pins the exact representation. Without it the
 * match is height-within-family and the LAST such level wins — within a family
 * hls.js orders by average bitrate ascending, so that is the best rendition of
 * that height. The codec family is never crossed: if it is part of the id, a
 * level in another family is not a candidate at all.
 */
export function resolveLevelIndex(levels: MenuLevel[], id: QualityId): number | null {
  let exact: number | null = null;
  let byHeight: number | null = null;
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    if (level.height !== id.height) continue;
    if (id.codecFamily !== undefined && level.codecSet !== id.codecFamily) continue;
    byHeight = index;
    if (id.repId !== undefined && repIdFromUri(level.uri) === id.repId) exact = index;
  }
  return exact ?? byHeight;
}

/**
 * levelIndexForHeightCap translates a HEIGHT cap (the engine-neutral output of
 * the metered-network policy in lib/hls-bandwidth) into the hls.js level index
 * to assign to `autoLevelCapping`. hls.js sorts height-ascending first, so the
 * last index at or below the cap admits every family up to that height. A ladder
 * whose every rung is above the cap still gets its lowest rung — capping Auto
 * out of existence would be worse than one rung too tall.
 */
export function levelIndexForHeightCap(
  levels: readonly MenuLevel[],
  maxHeight: number,
): number | null {
  const ranked = levels
    .map((level, index) => ({ index, height: level.height }))
    .filter(
      (level): level is { index: number; height: number } =>
        typeof level.height === "number" && level.height > 0,
    )
    .sort((a, b) => a.height - b.height);
  if (ranked.length === 0) return null;
  const withinCap = ranked.filter((level) => level.height <= maxHeight);
  return (withinCap[withinCap.length - 1] ?? ranked[0]).index;
}

/**
 * qualityLabel renders the quality menu-button's label from the current
 * selection state, matching the smooth-switch (hls.nextLevel + LEVEL_SWITCHED)
 * pending model in use-playback-engine:
 * - a manual pick not yet confirmed by LEVEL_SWITCHED shows the target rung with
 *   a trailing ellipsis ("720p…") — the "busy" state the spec requires;
 * - once confirmed (or picked while ABR was already there) it shows that rung;
 * - on Auto it shows "Auto", or "Auto (720p)" when the active ABR rung height is
 *   known (from the last LEVEL_SWITCHED).
 * `selected` is a QualitySelection (AUTO_QUALITY for adaptive); `activeHeight`
 * is the pixel height of the active rung (null when unknown, e.g. pre-manifest
 * or in a mocked run where no fragment ever loads).
 */
export function qualityLabel(opts: {
  levels: LevelOption[];
  selected: QualitySelection;
  activeHeight: number | null;
  pending: boolean;
}): string {
  const { levels, selected, activeHeight, pending } = opts;
  if (isAutoQuality(selected)) {
    return activeHeight && activeHeight > 0 ? `Auto (${activeHeight}p)` : "Auto";
  }
  const key = qualityKey(selected);
  const base = levels.find((l) => l.value === key)?.label ?? "Auto";
  return pending ? `${base}…` : base;
}
