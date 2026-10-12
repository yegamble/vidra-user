// Playlist watch mode: the pure rules (URL shape, next-position choice). No
// React and no fetching, so the loop/shuffle edge cases are unit-tested alone
// (lib/playlist-queue.test.ts). The hook that wires them to the API is
// lib/use-playlist-next.ts.

import type { Video } from "@/lib/api";
import { nextVideoHref } from "@/lib/end-card";

/** The playlist state a watch URL carries. `index` is the 1-based position. */
export interface PlaylistMode {
  playlistId: string;
  index: number | null;
  loop: boolean;
  shuffle: boolean;
}

export function readPlaylistMode(search: string): PlaylistMode {
  const q = new URLSearchParams(search);
  const raw = Number.parseInt(q.get("index") ?? "", 10);
  return {
    playlistId: q.get("playlist") ?? "",
    index: Number.isFinite(raw) && raw >= 1 ? raw : null,
    loop: q.get("loop") === "1",
    shuffle: q.get("shuffle") === "1",
  };
}

/** The watch URL for `video` at 1-based `index` of the playlist, flags carried. */
export function playlistWatchHref(
  video: Video,
  playlistId: string,
  index: number,
  flags: { loop?: boolean; shuffle?: boolean } = {},
): string {
  const q = new URLSearchParams({ playlist: playlistId, index: String(index) });
  if (flags.loop) q.set("loop", "1");
  if (flags.shuffle) q.set("shuffle", "1");
  return `${nextVideoHref(video)}?${q.toString()}`;
}

/**
 * The 0-based position to play after `pos`, and the shuffle history to keep.
 *
 * Sequential: pos + 1, wrapping to 0 only when looping; null at the end.
 * Shuffle: a random position not yet in `played`, so nothing repeats until every
 * item has played; once exhausted it reshuffles (history reset to just `pos`)
 * when looping, and ends otherwise.
 */
export function pickNextPosition({
  pos,
  total,
  loop,
  shuffle,
  played,
  random = Math.random,
}: {
  pos: number;
  total: number;
  loop: boolean;
  shuffle: boolean;
  played: readonly number[];
  random?: () => number;
}): { next: number | null; played: number[] } {
  if (!shuffle) {
    const next = pos + 1 < total ? pos + 1 : loop && total > 0 ? 0 : null;
    return { next, played: [] };
  }
  let seen = new Set([...played, pos]);
  let pool: number[] = [];
  for (let i = 0; i < total; i++) if (!seen.has(i)) pool.push(i);
  if (pool.length === 0 && loop && total > 1) {
    seen = new Set([pos]);
    pool = Array.from({ length: total }, (_, i) => i).filter((i) => i !== pos);
  }
  const next = pool.length === 0 ? null : pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return { next, played: [...seen] };
}
