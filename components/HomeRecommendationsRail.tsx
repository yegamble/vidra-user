"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import type { RecommendationItem } from "@/lib/api/types";
import { t } from "@/lib/i18n";
import { trackSearchEvent } from "@/lib/search-events";
import { RAIL_TILE, RAIL_TRACK } from "@/lib/rail";

// HomeRecommendationsRail is the home "For you" / "Trending now" discovery rail
// (search-service W4), mounted after the primary feed. Like
// LiveNowRail it is a quiet progressive-enhancement surface: it renders NOTHING
// while loading, on error, or when the endpoint returns no items. The home page
// mounts it after the primary feed so a late personalized response cannot push
// already-visible videos down the viewport.
//
// The endpoint (GET /api/v1/recommendations/home) works for everyone: signed-in
// callers whose instance + preference allow personalization get a personalized
// rail (personalized=true → "For you"); anonymous / opted-out / simple-mode
// callers get the trending fallback (personalized=false → "Trending now"). The
// heading is chosen from the `personalized` flag the server reports, never
// guessed client-side.
export function HomeRecommendationsRail() {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [personalized, setPersonalized] = useState(false);
  // Wait for the session to settle before asking. On a hard load the refresh
  // cookie is still being redeemed while this mounts, and firing then sent the
  // request as the WRONG viewer: observed in Chromium against a live core, a
  // signed-in visitor's hard load produced two calls — one carrying the
  // Authorization header, one not, because the provider re-renders the tree as
  // the session resolves — and the anonymous answer landed last. The rail is
  // the one surface that reads `personalized`, so that showed the generic list
  // under "Trending now" on every hard load and the personalized one only after
  // a client-side navigation. `status` is part of the effect's dependencies so
  // it also refetches across sign-in and sign-out.
  const { status } = useSession();

  useEffect(() => {
    if (status === "restoring") return;
    const controller = new AbortController();
    api
      .getHomeRecommendations({ limit: 12 }, controller.signal)
      .then((res) => {
        setItems(res.items ?? []);
        setPersonalized(res.personalized === true);
      })
      .catch(() => {
        // A miss simply shows no rail — never an error surface on the public feed.
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, [status]);

  if (items.length === 0) return null;

  const heading = personalized ? t("home.forYou") : t("home.trendingNow");
  return <RecommendationRail heading={heading} items={items} context="home" />;
}

// The presentation: a horizontal scroll rail of VideoCards (mirrors LiveNowRail's
// snap rail), with sampled impression events. Each card fires video.impression
// exactly once, the first time it scrolls into view (IntersectionObserver,
// threshold 0.5), so the search service learns what was actually seen without a
// flood — play/completed events come from the watch page.
function RecommendationRail({
  heading,
  items,
  context,
}: {
  heading: string;
  items: RecommendationItem[];
  context: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const id = el.dataset.videoId;
          if (!id || seenRef.current.has(id)) continue;
          seenRef.current.add(id);
          trackSearchEvent({
            type: "video.impression",
            video_id: id,
            position: Number(el.dataset.position) || 0,
            context,
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );
    list.querySelectorAll<HTMLElement>("[data-video-id]").forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items, context]);

  return (
    <section aria-label={heading} className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-title2 text-fg">{heading}</h2>
      </div>
      <ul
        ref={listRef}
        className={RAIL_TRACK}
      >
        {items.map((item, index) => (
          <li key={item.id} data-video-id={item.id} data-position={index} className={RAIL_TILE}>
            <VideoCard video={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
