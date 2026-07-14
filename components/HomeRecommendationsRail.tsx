"use client";

import { useEffect, useRef, useState } from "react";

import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import type { RecommendationItem } from "@/lib/api/types";
import { t } from "@/lib/i18n";
import { trackSearchEvent } from "@/lib/search-events";

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

  useEffect(() => {
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
  }, []);

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
        <h2 className="text-lg font-bold tracking-[-0.025em]">{heading}</h2>
      </div>
      <ul
        ref={listRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            data-video-id={item.id}
            data-position={index}
            className="w-[min(82vw,20rem)] flex-none snap-start sm:w-72 lg:w-64 xl:w-72"
          >
            <VideoCard video={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
