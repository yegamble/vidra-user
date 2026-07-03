"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import type { LiveStream } from "@/lib/api";

// ChannelLiveBadge surfaces a "Live now" link on a channel page when one of the
// channel's streams is live, linking viewers to the /live/[id] watch surface.
//
// The backend only exposes a live listing to the channel OWNER (GET
// /channels/:handle/live is 403 for anyone else, and the public Channel payload
// carries no live flag), so this consumes ONLY what the contract exposes: it
// renders for the signed-in owner of the channel. A public per-channel live
// listing would be a backend addition, tracked as a dependency — not faked here.
export function ChannelLiveBadge({
  handle,
  ownerId,
}: {
  handle: string;
  ownerId: string;
}) {
  const { user } = useSession();
  const isOwner = user?.id === ownerId;
  const [live, setLive] = useState<LiveStream | null>(null);

  useEffect(() => {
    // Only the owner can list a channel's streams (403 otherwise), so don't even
    // ask as a non-owner. `live` stays at its initial null and the render guard
    // below hides the badge — no synchronous state reset needed.
    if (!isOwner) return;
    const controller = new AbortController();
    api
      .getLiveStreams(handle, controller.signal)
      .then((res) => {
        setLive(res.live_streams.find((s) => s.state === "live") ?? null);
      })
      .catch(() => {
        // A miss (e.g. transient error) simply shows no badge — never an error UI
        // on a public channel page.
        if (!controller.signal.aborted) setLive(null);
      });
    return () => controller.abort();
  }, [handle, isOwner]);

  if (!isOwner || !live) return null;

  return (
    <Link
      href={`/live/${encodeURIComponent(live.id)}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
      Live now
      <span className="sr-only">: {live.title}</span>
    </Link>
  );
}
