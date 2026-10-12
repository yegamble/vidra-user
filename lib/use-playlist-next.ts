"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, type PlaylistDetail, type Video } from "@/lib/api";
import { pickNextPosition, playlistWatchHref, readPlaylistMode } from "@/lib/playlist-queue";
import { useAppendingList } from "@/lib/use-appending-list";
import { useSettledSession } from "@/lib/use-settled-session";

// Playlist watch mode. The URL is the state: ?playlist=<id>&index=<1-based>
// with optional loop=1 / shuffle=1 (the toggles rewrite the URL in place, so a
// shared link keeps them). Items are paged through the shared appending seam —
// for the panel AND for the cursor — and the NEXT item is resolved by offset, so
// it is correct when it sits on a page that was never loaded. Reads go through
// GET /playlists/{id}, which already enforces owner-only private playlists and
// drops items the viewer cannot see.

const CHANGE = "vidra:playlist-mode";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(CHANGE, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(CHANGE, listener);
  };
}
const readSearch = () => window.location.search;
const serverSearch = () => "";

function setFlag(name: "loop" | "shuffle", on: boolean) {
  const q = new URLSearchParams(window.location.search);
  if (on) q.set(name, "1");
  else q.delete(name);
  const qs = q.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  window.dispatchEvent(new Event(CHANGE));
}

// Shuffle history is session state: positions already played in this playlist.
const playedKey = (id: string) => `vidra:playlist-played:${id}`;
function readPlayed(id: string): number[] {
  try {
    const v: unknown = JSON.parse(window.sessionStorage.getItem(playedKey(id)) ?? "[]");
    return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
function writePlayed(id: string, played: number[]) {
  try {
    if (played.length === 0) window.sessionStorage.removeItem(playedKey(id));
    else window.sessionStorage.setItem(playedKey(id), JSON.stringify(played));
  } catch {
    // Session storage unavailable: shuffle just forgets its history.
  }
}

type Meta = Pick<PlaylistDetail, "title" | "owner_id" | "visibility">;

export function usePlaylistNext(video: Video | undefined) {
  const search = useSyncExternalStore(subscribe, readSearch, serverSearch);
  const { playlistId, index, loop, shuffle } = useMemo(() => readPlaylistMode(search), [search]);
  const active = playlistId !== "";
  const { settled, viewerKey } = useSettledSession();
  const [meta, setMeta] = useState<Meta | null>(null);
  const list = useAppendingList<Video>({
    queryKey: `playlist:${playlistId}`,
    getId: (v) => v.id,
    viewer: { settled, viewerKey },
    load: async (window, signal) => {
      if (!active) return { items: [] };
      const res = await api.getPlaylist(playlistId, window, signal);
      setMeta({ title: res.title, owner_id: res.owner_id, visibility: res.visibility });
      return { items: res.videos, total: res.total };
    },
  });
  const { items } = list;

  // 0-based position of the playing video. The URL's index is trusted only when
  // the loaded item there IS this video (a reorder moves it); a bare
  // ?playlist= link (VideoCard) has no index and is located by id.
  const hinted = index === null ? -1 : index - 1;
  const byId = video ? items.findIndex((v) => v.id === video.id) : -1;
  const rawPos = !video ? -1 : items[hinted]?.id === video.id ? hinted : byId >= 0 ? byId : hinted >= items.length ? hinted : -1;
  const total = list.total ?? (list.status === "ready" && !list.hasMore ? items.length : null);
  // A stale link (index past the end) must not read "1000 / 5" or pick a next.
  const pos = total !== null && rawPos >= total ? -1 : rawPos;

  // Landing deep in a long playlist: page forward until the playing item is held.
  const needMore = active && list.status === "ready" && list.hasMore && (index !== null ? hinted >= items.length : byId < 0);
  const { loadMore, moreStatus } = list;
  useEffect(() => {
    if (needMore && moreStatus === "idle") loadMore();
  }, [needMore, moreStatus, loadMore, items.length]);

  // Chosen once per (position, flags) so a re-render never re-rolls the shuffle.
  const picked = useMemo(
    () =>
      !active || pos < 0 || total === null
        ? null
        : pickNextPosition({ pos, total, loop, shuffle, played: shuffle ? readPlayed(playlistId) : [] }),
    [active, playlistId, pos, total, loop, shuffle],
  );
  useEffect(() => {
    // An exhausted non-loop shuffle forgets its history, so shuffling again starts fresh.
    if (shuffle && picked) writePlayed(playlistId, picked.next === null ? [] : picked.played);
  }, [shuffle, picked, playlistId]);
  const nextPos = picked?.next ?? null;

  const loadedNext = nextPos === null ? undefined : items[nextPos];
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{ key: string; video?: Video; failed?: boolean } | null>(null);
  const nextKey = `${playlistId}:${nextPos}:${attempt}`;
  useEffect(() => {
    if (nextPos === null || loadedNext || !settled) return;
    const controller = new AbortController();
    api
      .getPlaylist(playlistId, { limit: 1, offset: nextPos }, controller.signal)
      .then((res) => !controller.signal.aborted && setFetched({ key: nextKey, video: res.videos[0] }))
      .catch(() => !controller.signal.aborted && setFetched({ key: nextKey, failed: true }));
    return () => controller.abort();
  }, [nextPos, loadedNext, playlistId, nextKey, settled]);

  const resolved = fetched?.key === nextKey ? fetched : null;
  const next = nextPos === null ? null : (loadedNext ?? resolved?.video ?? null);
  const href = next && nextPos !== null ? playlistWatchHref(next, playlistId, nextPos + 1, { loop, shuffle }) : undefined;
  const failed = list.status === "error" || resolved?.failed === true;
  const retry = useCallback(() => {
    list.reload();
    setAttempt((n) => n + 1);
  }, [list]);

  return {
    active, next, href, retry,
    status: failed ? ("error" as const) : list.status,
    playlistId, meta, list, pos, total, loop, shuffle,
    setLoop: (on: boolean) => setFlag("loop", on),
    setShuffle: (on: boolean) => {
      if (on) writePlayed(playlistId, []);
      setFlag("shuffle", on);
    },
    itemHref: (v: Video, i: number) => playlistWatchHref(v, playlistId, i + 1, { loop, shuffle }),
  };
}
