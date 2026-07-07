// Pure geometry / formatting helpers for the custom player shell
// (components/player/*). No React, no DOM — kept here so the shell's seek math,
// buffered-band painting, volume stepping and the slider aria text are all
// unit-testable in isolation (lib/player-ui.test.ts).

import { formatDuration } from "./format";

/** clamp restricts n to [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * fractionAt maps a pointer clientX over a track (its left edge + width, from
 * getBoundingClientRect) to a 0..1 fraction of the track, clamped. A zero-width
 * track (not yet laid out) yields 0.
 */
export function fractionAt(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return clamp((clientX - left) / width, 0, 1);
}

/** timeAtFraction converts a 0..1 track fraction to a playback time in seconds. */
export function timeAtFraction(fraction: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp(fraction, 0, 1) * duration;
}

/** fractionOfTime is the inverse: a playback time as a 0..1 fraction of duration. */
export function fractionOfTime(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp(time / duration, 0, 1);
}

/** A painted band on the seek track, as 0..1 fractions (left edge + width). */
export interface SeekBand {
  left: number;
  width: number;
}

/**
 * bufferedBands maps a media element's buffered TimeRanges (already read into
 * [start, end] pairs) to painted bands as 0..1 fractions of the duration. Ranges
 * are clamped to [0, duration]; empty/degenerate ranges and a non-positive
 * duration yield no bands.
 */
export function bufferedBands(
  ranges: ReadonlyArray<readonly [number, number]>,
  duration: number,
): SeekBand[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const bands: SeekBand[] = [];
  for (const [start, end] of ranges) {
    const a = clamp(start, 0, duration);
    const b = clamp(end, 0, duration);
    if (b > a) bands.push({ left: a / duration, width: (b - a) / duration });
  }
  return bands;
}

/**
 * readBuffered reads a media element's buffered TimeRanges into [start,end]
 * pairs. Tolerates a missing/undefined TimeRanges (some environments, e.g.
 * jsdom, don't expose `buffered`) by returning no ranges.
 */
export function readBuffered(buffered: TimeRanges | null | undefined): Array<[number, number]> {
  if (!buffered) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < buffered.length; i += 1) {
    out.push([buffered.start(i), buffered.end(i)]);
  }
  return out;
}

/**
 * seekValueText renders the seek slider's aria-valuetext as "1:23 of 12:40"
 * (elapsed of total). An unknown duration collapses to just the elapsed time.
 */
export function seekValueText(current: number, duration: number): string {
  const now = formatDuration(current);
  if (!Number.isFinite(duration) || duration <= 0) return now;
  return `${now} of ${formatDuration(duration)}`;
}

/**
 * stepVolume nudges a 0..1 volume by a signed percentage of the full range
 * (e.g. +5 → +0.05), clamped to [0, 1] and rounded to whole percent so repeated
 * steps stay on a clean ladder.
 */
export function stepVolume(current: number, deltaPercent: number): number {
  const next = clamp(current + deltaPercent / 100, 0, 1);
  return Math.round(next * 100) / 100;
}

/**
 * volumePercent is the 0..100 value the volume slider paints and announces: 0
 * when muted (whatever the underlying level), else the level scaled to percent.
 */
export function volumePercent(volume: number, muted: boolean): number {
  if (muted) return 0;
  return Math.round(clamp(volume, 0, 1) * 100);
}
