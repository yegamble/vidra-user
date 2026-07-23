"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { HomeShelf } from "@/components/HomeShelf";
import { VideoCardSkeleton } from "@/components/VideoCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import type { HistoryItem, Video } from "@/lib/api";
import {
  MAX_HOME_SHELVES,
  readHomeShelvesHint,
  subscribeHomeShelvesHint,
  writeHomeShelvesHint,
} from "@/lib/home-shelves-hint";
import { isFinished, resumeFraction } from "@/lib/resume-progress";

// HomeShelves is the signed-in personalization band that leads the home page
// (design-system.md "Shelves on Home", Apple-TV pattern): a "Continue watching"
// rail (watch-history entries that carry a saved resume position) followed by a
// "Following" rail (latest videos from the channels the viewer follows), both
// ABOVE the public browse feed. It fetches ONLY for an authenticated session.
//
// To kill the above-the-fold layout jump the band used to cause (it rendered
// null until its client fetches landed, then shoved the chips + grid down), a
// returning signed-in viewer gets `hint` skeleton shelves reserved before first
// paint (lib/home-shelves-hint.ts): the space is a skeleton, not a hole, and
// the real shelves swap in at the same height. A signed-out viewer stores 0 and
// reserves nothing, so the anonymous home (and every route-mocked e2e that
// never signs in) is structurally unchanged.

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
  const [loaded, setLoaded] = useState(false);

  // Last visit's shelf count (0..2). The server + first hydration render see 0
  // (nothing reserved server-side, where the band is null anyway); after
  // hydration the pre-paint-stamped localStorage value drives the reservation.
  const hint = useSyncExternalStore(subscribeHomeShelvesHint, readHomeShelvesHint, () => 0);

  useEffect(() => {
    // Guard every fetch to a settled authed session: never probe these auth-only
    // endpoints while restoring or signed out (a 401 is not an error surface).
    if (!authed) return;
    const controller = new AbortController();
    // Two independent authed reads; a miss on either simply omits that shelf.
    // `loaded` flips once BOTH settle so the skeleton reservation holds until
    // the real content (or its absence) is known — no mid-fetch collapse.
    let settled = 0;
    const settle = () => {
      settled += 1;
      if (settled === 2 && !controller.signal.aborted) setLoaded(true);
    };
    api
      .getWatchHistory({ limit: 20 }, controller.signal)
      .then((res) => setContinueWatching((res.videos ?? []).filter(resumable)))
      .catch(() => {
        if (!controller.signal.aborted) setContinueWatching([]);
      })
      .finally(settle);
    api
      .getSubscriptionVideos({ limit: 20 }, controller.signal)
      .then((res) => setFollowing(res.videos ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setFollowing([]);
      })
      .finally(settle);
    return () => controller.abort();
  }, [authed]);

  const shelfCount = (continueWatching.length > 0 ? 1 : 0) + (following.length > 0 ? 1 : 0);

  // Remember this visit's shelf count for next time: the resolved count for an
  // authed viewer, 0 for anyone signed out (so an anonymous revisit reserves
  // nothing). Skipped while the session is still restoring — not yet known.
  useEffect(() => {
    if (status === "restoring") return;
    if (!authed) {
      writeHomeShelvesHint(0);
      return;
    }
    if (loaded) writeHomeShelvesHint(shelfCount);
  }, [status, authed, loaded, shelfCount]);

  // Reservation window: the session is restoring, or it is authed but the
  // fetches have not both landed. Paint `hint` skeleton shelves so the reserved
  // band is a skeleton (not a hole, and not a push-down when content lands).
  if (status === "restoring" || (authed && !loaded)) {
    return hint > 0 ? <HomeShelvesSkeleton count={hint} /> : null;
  }

  if (!authed) return null;
  // Render nothing (no wrapper, no margin) once resolved with no shelves, so a
  // signed-in viewer with no history/subscriptions sees the browse feed exactly
  // where a signed-out viewer does.
  if (shelfCount === 0) return null;

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

// Placeholder for `count` shelves (0..MAX_HOME_SHELVES) that mirrors the real
// band's wrapper + each HomeShelf's geometry (Title2-height heading + a rail of
// tiles at the exact shelf tile widths), so the reserved space matches the
// content that replaces it and nothing below shifts.
function HomeShelvesSkeleton({ count }: { count: number }) {
  const shelves = Math.min(Math.max(count, 0), MAX_HOME_SHELVES);
  return (
    <div
      aria-hidden
      data-testid="home-shelves-skeleton"
      className="mb-8 flex flex-col gap-8 sm:mb-10 sm:gap-10"
    >
      {Array.from({ length: shelves }).map((_, i) => (
        <section key={i} data-testid="home-shelf-skeleton">
          <div className="mb-4 flex items-baseline">
            <Skeleton className="h-7 w-44" />
          </div>
          <ul className="scrollbar-none flex gap-4 overflow-x-hidden pb-2">
            {Array.from({ length: 6 }).map((__, j) => (
              <li
                key={j}
                className="w-[min(82vw,20rem)] flex-none sm:w-72 lg:w-64 xl:w-72"
              >
                <VideoCardSkeleton />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
