"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DashboardView } from "./DashboardView";
import { ManagedVideoView } from "./ManagedVideoView";

// DashboardRoute is the client entry for `/studio`. It renders the single-video
// management surface for the `?video=<id>` moderator/owner deep link (the studio
// nav is hidden by the layout in that mode), otherwise the dashboard. It also
// keeps the phone CreateSheet's legacy hash deep links working: `#upload` and
// `#go-live` forward to the split Content/Live routes.
export function DashboardRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const videoId = params.get("video");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash === "#upload") router.replace("/studio/content?upload=1");
    else if (hash === "#go-live") router.replace("/studio/live?new=1");
  }, [router]);

  if (videoId) return <ManagedVideoView videoId={videoId} />;
  return <DashboardView />;
}
