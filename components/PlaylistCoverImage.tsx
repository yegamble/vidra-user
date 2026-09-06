"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";

type Props = { playlistId: string; alt: string; className?: string; version?: number };

// Image elements cannot send the bearer needed for an owner's private cover.
export function PlaylistCoverImage(props: Props) {
  const { status, user } = useSession();
  if (status === "restoring") return null;
  return <CoverBytes key={`${props.playlistId}:${props.version ?? 0}:${status}:${user?.id ?? ""}`} {...props} />;
}

function CoverBytes({ playlistId, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    api.fetchPlaylistThumbnail(playlistId, controller.signal).then(blob => {
      // A late response must not allocate bytes for an old viewer or cover.
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [playlistId]);
  if (failed) return <span className="text-xs text-fg-muted">Cover unavailable</span>;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- authenticated object URL
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
