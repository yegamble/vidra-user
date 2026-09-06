"use client";

import { useSyncExternalStore } from "react";
import { useSession } from "@/components/auth/AuthProvider";
import { api, type PlaylistDetail } from "@/lib/api";
import { nextVideoHref } from "@/lib/end-card";
import { useApiResource } from "@/lib/use-api-resource";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
const readPlaylist = () => new URLSearchParams(window.location.search).get("playlist") ?? "";
const serverPlaylist = () => "";

// Carry only the playlist id in navigation; reauthorize and read its saved order.
export function usePlaylistNext(videoId: string | undefined) {
  const playlistId = useSyncExternalStore(subscribe, readPlaylist, serverPlaylist);
  const { status: session, user } = useSession();
  const resource = useApiResource<PlaylistDetail | null>(signal => {
    if (!playlistId || session === "restoring") return Promise.resolve(null);
    return api.getPlaylist(playlistId, signal);
  }, [playlistId, session, user?.id]);
  const videos = resource.data?.videos ?? [];
  const index = videos.findIndex(video => video.id === videoId);
  const next = index < 0 ? null : videos[index + 1] ?? null;
  return {
    active: playlistId !== "", next, status: resource.status, retry: resource.retry,
    href: next ? `${nextVideoHref(next)}?playlist=${encodeURIComponent(playlistId)}` : undefined,
  };
}
