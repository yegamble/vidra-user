"use client";

import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api, getInstanceCached, type Video } from "@/lib/api";

const ownedChannelRequests = new Map<string, Promise<ReadonlySet<string>>>();

function ownedChannelIds(userId: string): Promise<ReadonlySet<string>> {
  const cached = ownedChannelRequests.get(userId);
  if (cached) return cached;
  const request = api
    .getMyChannels()
    .then((response) => new Set(response.channels.map((channel) => channel.id)) as ReadonlySet<string>)
    .catch((error: unknown) => {
      ownedChannelRequests.delete(userId);
      throw error;
    });
  ownedChannelRequests.set(userId, request);
  return request;
}

export type VideoActionPermissions = {
  signedIn: boolean;
  privileged: boolean;
  canManage: boolean;
  canDownload: boolean;
};

/**
 * Resolve the card-menu capability matrix without an N-per-card request:
 * instance policy and the signed-in user's channels are each fetched once and
 * shared by every thumbnail on the page. Server endpoints repeat these checks;
 * this hook controls presentation, not authorization.
 */
export function useVideoActionPermissions(video: Video): VideoActionPermissions {
  const { status, user } = useSession();
  const signedIn = status === "authed";
  const privileged = user?.role === "admin" || user?.role === "moderator";
  const [ownedChannels, setOwnedChannels] = useState<{
    userId: string;
    ids: ReadonlySet<string>;
  } | null>(null);
  const [downloadsEnabled, setDownloadsEnabled] = useState(false);

  useEffect(() => {
    if (!signedIn || !user || privileged || video.remote === true || !video.channel_id) {
      return;
    }
    let cancelled = false;
    ownedChannelIds(user.id)
      .then((ids) => {
        if (!cancelled) setOwnedChannels({ userId: user.id, ids });
      })
      .catch(() => {
        if (!cancelled) setOwnedChannels({ userId: user.id, ids: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [privileged, signedIn, user, video.channel_id, video.remote]);

  useEffect(() => {
    let cancelled = false;
    getInstanceCached()
      .then((instance) => {
        if (!cancelled) setDownloadsEnabled(instance.features.downloads === true);
      })
      .catch(() => {
        if (!cancelled) setDownloadsEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    signedIn,
    privileged,
    canManage:
      video.remote !== true &&
      (privileged ||
        (signedIn &&
          !!user &&
          ownedChannels?.userId === user.id &&
          !!video.channel_id &&
          ownedChannels.ids.has(video.channel_id))),
    // Effective download availability (config-parity W9): the instance
    // downloads feature AND the video's own download_enabled flag — absent
    // (card payloads don't carry it) is treated as enabled, the server's
    // layered gate stays authoritative. Moderators/admins bypass both.
    canDownload:
      video.remote !== true &&
      (privileged || (downloadsEnabled && video.download_enabled !== false)),
  };
}

/** Clear cached channel ownership after creator mutations or between tests. */
export function invalidateVideoActionPermissionCache(): void {
  ownedChannelRequests.clear();
}

export const resetVideoActionPermissionCacheForTests = invalidateVideoActionPermissionCache;
