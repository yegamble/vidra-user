"use client";

import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { HomeShelf } from "@/components/HomeShelf";
import { api } from "@/lib/api";
import type { HistoryItem, Video } from "@/lib/api";
import { isFinished, resumeFraction } from "@/lib/resume-progress";

// HomeShelves is the signed-in personalization band that leads the home page
// (design-system.md "Shelves on Home", Apple-TV pattern): a "Continue watching"
// rail (watch-history entries that carry a saved resume position) followed by a
// "Following" rail (latest videos from the channels the viewer follows), both
// ABOVE the public browse feed. Like the discovery rails below the feed it is a
// quiet progressive-enhancement surface: it fetches ONLY for an authenticated
// session and renders NOTHING — no header, no empty rail — while the session is
// restoring, when signed out, on a fetch error, or when a shelf has no items.
// So the signed-out home (and every route-mocked e2e that never signs in) is
// structurally unchanged.

// A history item belongs on "Continue watching" only when the caller has a
// real resume position to return to (position 0 / missing is a fresh watch) AND
// the video is not already finished. A video watched to >= FINISHED_FRACTION
// (~95%) is done — YouTube drops it from Continue watching (Wave C also filters
// it out server-side; this keeps the client honest for already-fetched cards).
function resumable(item: HistoryItem): boolean {
  if (typeof item.position_seconds !== "number" || item.position_seconds <= 0) return false;
  return !isFinished(item.position_seconds, item.duration_seconds);
}

export function HomeShelves() {
  const { status } = useSession();
  const authed = status === "authed";
  const [continueWatching, setContinueWatching] = useState<HistoryItem[]>([]);
  const [following, setFollowing] = useState<Video[]>([]);

  useEffect(() => {
    // Guard every fetch to a settled authed session: never probe these auth-only
    // endpoints while restoring or signed out (a 401 is not an error surface).
    // While not authed the component renders null regardless of any earlier
    // state, so there is nothing to clear here.
    if (!authed) return;
    const controller = new AbortController();
    // Two independent authed reads; a miss on either simply omits that shelf.
    api
      .getWatchHistory({ limit: 20 }, controller.signal)
      .then((res) => setContinueWatching((res.videos ?? []).filter(resumable)))
      .catch(() => {
        if (!controller.signal.aborted) setContinueWatching([]);
      });
    api
      .getSubscriptionVideos({ limit: 20 }, controller.signal)
      .then((res) => setFollowing(res.videos ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setFollowing([]);
      });
    return () => controller.abort();
  }, [authed]);

  if (!authed) return null;
  // Render nothing (no wrapper, no margin) until at least one shelf has content,
  // so a signed-in viewer with no history/subscriptions sees the browse feed
  // exactly where a signed-out viewer does.
  if (continueWatching.length === 0 && following.length === 0) return null;

  return (
    <div className="mb-8 flex flex-col gap-8 sm:mb-10 sm:gap-10">
      {continueWatching.length > 0 ? (
        <HomeShelf
          heading="Continue watching"
          items={continueWatching}
          progressFor={(_video, index) => {
            const item = continueWatching[index];
            return resumeFraction(item.position_seconds, item.duration_seconds) ?? undefined;
          }}
        />
      ) : null}
      {following.length > 0 ? <HomeShelf heading="Following" items={following} /> : null}
    </div>
  );
}
