"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmbedNotice, EmbedVideo, readEmbedContext } from "@/components/EmbedPlayer";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { ApiError, api } from "@/lib/api";
import type { PlaylistDetail, Video } from "@/lib/api";
import { decideEmbed } from "@/lib/embed-privacy";
import { type EmbedParams, parseEmbedParams } from "@/lib/embed-params";
import { pickNextPosition } from "@/lib/playlist-queue";
import { useAppendingList } from "@/lib/use-appending-list";
import { useSettledSession } from "@/lib/use-settled-session";

type Meta = Pick<PlaylistDetail, "title" | "visibility">;
type Direction = 1 | -1;

// PeerTube's `playlistPosition` is 1-based; anything else starts at the head.
function startIndex(search: string): number {
  const raw = Number.parseInt(new URLSearchParams(search).get("playlistPosition") ?? "", 10);
  return Number.isFinite(raw) && raw >= 1 ? raw - 1 : 0;
}

// The playlist embed served at /embed/playlists/[id] (PeerTube's
// /video-playlists/embed/{id}): the video embed's player, driven through the
// playlist in order. Visibility is the server's call — GET /playlists/{id}
// answers only for what this viewer may see and already drops items they
// cannot — and the queue rule is the watch page's own (pickNextPosition), paged
// through the same appending seam, so position 41 of 500 is reached by paging
// to it rather than by guessing. A private playlist reads as "not available",
// exactly like a private video. An item the embed cannot play (embedding
// disabled or not whitelisted for this site, a password gate, or a detail the
// server now refuses) is skipped in the direction of travel.
export function PlaylistEmbedPlayer({ id }: { id: string }) {
  const [params] = useState<EmbedParams>(() =>
    parseEmbedParams(typeof window === "undefined" ? "" : window.location.search),
  );
  const [pos, setPos] = useState(() => startIndex(typeof window === "undefined" ? "" : window.location.search));
  // Once the viewer (or the end of a video) moves, later items play at once and
  // the ?t= start offset no longer applies.
  const [engaged, setEngaged] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [refusal, setRefusal] = useState<"notfound" | "error" | null>(null);
  const direction = useRef<Direction>(1);
  const skipped = useRef(0);
  const [stalled, setStalled] = useState(false);
  const { settled, viewerKey } = useSettledSession();

  const list = useAppendingList<Video>({
    queryKey: `playlist-embed:${id}`,
    getId: (v) => v.id,
    viewer: { settled, viewerKey },
    load: async (window, signal) => {
      try {
        const res = await api.getPlaylist(id, window, signal);
        setMeta({ title: res.title, visibility: res.visibility });
        setRefusal(null);
        return { items: res.videos, total: res.total };
      } catch (err) {
        if (!signal.aborted) {
          const gone = err instanceof ApiError && [401, 403, 404].includes(err.status);
          setRefusal(gone ? "notfound" : "error");
        }
        throw err;
      }
    },
  });
  const { items, status, hasMore, moreStatus, loadMore } = list;
  const total = list.total ?? items.length + (hasMore ? 1 : 0);
  const current: Video | undefined = items[pos];

  // Deep start or a wrap to the tail: page forward until the target is held.
  useEffect(() => {
    if (status === "ready" && !current && hasMore && moreStatus === "idle") loadMore();
  }, [status, current, hasMore, moreStatus, loadMore, items.length]);

  const go = useCallback(
    (to: number | null, dir: Direction, viaViewer: boolean) => {
      if (to === null) return;
      direction.current = dir;
      if (viaViewer) skipped.current = 0;
      setEngaged(true);
      setPos(to);
    },
    [],
  );
  const nextPos = pickNextPosition({ pos, total, loop: params.loop, shuffle: false, played: [] }).next;
  const prevPos = pos > 0 ? pos - 1 : params.loop && total > 1 ? total - 1 : null;
  const goNext = useCallback(() => go(nextPos, 1, true), [go, nextPos]);
  const goPrev = useCallback(() => go(prevPos, -1, true), [go, prevPos]);

  // An item the embed can't play: move on in the direction of travel, and stop
  // once a whole lap has been skipped (nothing in this playlist is playable here).
  const skip = useCallback(
    (videoId: string) => {
      if (current?.id !== videoId) return;
      skipped.current += 1;
      if (skipped.current >= total) {
        setStalled(true);
        return;
      }
      const dir = direction.current;
      const to =
        dir === 1
          ? pickNextPosition({ pos, total, loop: true, shuffle: false, played: [] }).next
          : pos > 0
            ? pos - 1
            : total - 1;
      if (to === null || to === pos) setStalled(true);
      else go(to, dir, false);
    },
    [current?.id, pos, total, go],
  );

  // Reaching the end of a video: advance. The last item without loop stays on
  // the player's own end card (replay).
  const onEnded = useCallback(() => {
    skipped.current = 0;
    goNext();
  }, [goNext]);

  const itemParams = useMemo<EmbedParams>(
    () => ({
      ...params,
      title: false,
      // loop is the PLAYLIST's loop; a single-item playlist loops the video.
      loop: params.loop && total <= 1,
      autoplay: params.autoplay || engaged,
      startAt: engaged ? null : params.startAt,
      stopAt: engaged ? null : params.stopAt,
    }),
    [params, engaged, total],
  );

  if (refusal === "notfound" || meta?.visibility === "private") {
    return <EmbedNotice>This playlist is not available.</EmbedNotice>;
  }
  if (refusal === "error" || status === "error") {
    return <EmbedNotice>Could not load this playlist.</EmbedNotice>;
  }
  if (status === "loading" || (!current && hasMore)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-sm text-white/65">Loading…</div>
    );
  }
  if (items.length === 0) return <EmbedNotice>This playlist has no videos.</EmbedNotice>;
  if (!current) return <EmbedNotice>This playlist position is not available.</EmbedNotice>;
  if (stalled) return <EmbedNotice>No video in this playlist can be played here.</EmbedNotice>;

  const bar = (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-white backdrop-blur-sm">
      <button
        type="button"
        onClick={goPrev}
        disabled={prevPos === null}
        aria-label="Previous video"
        className="rounded-full p-1 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={nextPos === null}
        aria-label="Next video"
        className="rounded-full p-1 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
      <span className="shrink-0 text-xs tabular-nums text-white/80" aria-label="Playlist position">
        {pos + 1} / {list.total ?? total}
      </span>
      {params.title ? <span className="min-w-0 truncate text-sm font-semibold">{current.title}</span> : null}
    </div>
  );

  return (
    <PlaylistItem
      key={current.id}
      video={current}
      params={itemParams}
      onEnded={onEnded}
      onSkip={skip}
      onPlayable={() => {
        skipped.current = 0;
      }}
      overlay={bar}
    />
  );
}

// One playlist item: the per-video embed rules (embed-privacy policy, then the
// detail the server hands this viewer) run BEFORE anything plays; a refusal
// skips the item rather than showing a dead frame in the middle of a playlist.
function PlaylistItem({
  video,
  params,
  onEnded,
  onSkip,
  onPlayable,
  overlay,
}: {
  video: Video;
  params: EmbedParams;
  onEnded: () => void;
  onSkip: (id: string) => void;
  onPlayable: () => void;
  overlay: React.ReactNode;
}) {
  const [detail, setDetail] = useState<Video | null>(null);
  const skipRef = useRef(onSkip);
  const playableRef = useRef(onPlayable);
  useEffect(() => {
    skipRef.current = onSkip;
    playableRef.current = onPlayable;
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const skip = () => !signal.aborted && skipRef.current(video.id);
    api
      .getVideoEmbedPrivacy(video.id, undefined, signal)
      // A failed policy read fails OPEN to the detail, as the video embed does.
      .then((policy) => decideEmbed(policy, readEmbedContext()) === "allow", () => true)
      .then((allowed) => {
        if (signal.aborted) return;
        if (!allowed) return skip();
        return api.getVideo(video.id, undefined, signal).then((v) => {
          if (signal.aborted) return;
          playableRef.current();
          setDetail(v);
        }, skip);
      });
    return () => controller.abort();
  }, [video.id]);

  if (detail === null) {
    return (
      <div className="relative flex h-dvh items-center justify-center bg-black text-sm text-white/65">
        {overlay}
        Loading…
      </div>
    );
  }
  return <EmbedVideo video={detail} params={params} playbackToken={null} onEnded={onEnded} overlay={overlay} />;
}
