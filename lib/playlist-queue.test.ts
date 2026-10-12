import { describe, expect, it } from "vitest";

import type { Video } from "@/lib/api";
import { pickNextPosition, playlistWatchHref, readPlaylistMode } from "./playlist-queue";

const v = { id: "abc" } as Video;

describe("playlist URL state", () => {
  it("round-trips playlist, 1-based index and flags", () => {
    const href = playlistWatchHref(v, "p 1", 3, { loop: true, shuffle: true });
    expect(href).toContain("playlist=p+1&index=3&loop=1&shuffle=1");
    expect(readPlaylistMode(href.split("?")[1])).toEqual({ playlistId: "p 1", index: 3, loop: true, shuffle: true });
  });
  it("treats a bare ?playlist= link (VideoCard) as sequential with unknown position", () => {
    expect(readPlaylistMode("?playlist=p1")).toEqual({ playlistId: "p1", index: null, loop: false, shuffle: false });
    expect(readPlaylistMode("?playlist=p1&index=0").index).toBeNull();
  });
});

describe("pickNextPosition", () => {
  const base = { total: 3, loop: false, shuffle: false, played: [] as number[] };
  it("advances, ends without loop, wraps with loop", () => {
    expect(pickNextPosition({ ...base, pos: 0 }).next).toBe(1);
    expect(pickNextPosition({ ...base, pos: 2 }).next).toBeNull();
    expect(pickNextPosition({ ...base, pos: 2, loop: true }).next).toBe(0);
  });
  it("shuffle never repeats until every item has played", () => {
    const total = 6;
    let pos = 2;
    let played: number[] = [];
    const order = [pos];
    for (let i = 0; i < total - 1; i++) {
      const r = pickNextPosition({ pos, total, loop: false, shuffle: true, played, random: Math.random });
      expect(r.next).not.toBeNull();
      pos = r.next as number;
      played = r.played;
      order.push(pos);
    }
    expect(new Set(order).size).toBe(total);
    expect(pickNextPosition({ pos, total, loop: false, shuffle: true, played: [...played, pos] }).next).toBeNull();
  });
  it("shuffle + loop reshuffles once exhausted, never replaying the current item", () => {
    const r = pickNextPosition({ pos: 1, total: 3, loop: true, shuffle: true, played: [0, 1, 2], random: () => 0 });
    expect(r.next).toBe(0);
    expect(r.played).toEqual([1]);
  });
});
