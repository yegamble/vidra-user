"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RestrictedModePlaceholder } from "@/components/RestrictedModePlaceholder";
import { Skeleton } from "@/components/ui/Skeleton";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { VideoCardPreview } from "@/components/VideoCardPreview";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import { useVideoCardPresentation } from "@/lib/use-video-card-presentation";

const RELATED_COUNT = 6;

// RelatedVideos is the watch page's "watch next" rail. It prefers the search
// service's related-videos endpoint (GET /api/v1/videos/{id}/recommendations,
// search-service W4) and FALLS BACK to the original same-channel + same-category
// composition when that endpoint errors or returns nothing — so an older core
// (or a search outage) still shows a sensible rail. The fallback lists the
// channel directly via GET /channels/{handle}/videos (detail carries
// channel_handle) and fills the rest from GET /videos?category=. The current
// video is excluded and results deduped, capped at 6 cards. The section hides
// itself while loading, on failure, and when nothing relates — it is pure polish
// and must never break the watch page.
//
// `belowLayout` (theater mode, PLAY-04): when the watch page is in theater mode
// the rail reflows to a full-width row of cards BELOW the stage instead of the
// fixed-width right rail — the width cap is dropped and the card list becomes a
// responsive multi-column grid.
export function RelatedVideos({
  video,
  belowLayout = false,
  onFirstRelated,
}: {
  video: Video;
  belowLayout?: boolean;
  /**
   * Reports the first related entry (or null) up to the watch page, so the
   * player's end card (PLAY-08) can queue it as "next" without a second fetch.
   * Fires once the list resolves — pass a stable setter (never an inline arrow).
   */
  onFirstRelated?: (video: Video | null) => void;
}) {
  const [related, setRelated] = useState<Video[] | null>(null);

  const { id, channel_handle: channelHandle, channel_id: channelId, category } = video;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      // Prefer the recommendations endpoint. On error/empty, fall through to the
      // heuristic composition below (core itself degrades server-side, so this is
      // a second safety net that also covers an older core lacking the route).
      let recommended: Video[] | null = null;
      try {
        const res = await api.getVideoRecommendations(id, { limit: RELATED_COUNT }, controller.signal);
        recommended = res.items ?? [];
      } catch {
        if (controller.signal.aborted) return;
        recommended = null;
      }
      if (recommended && recommended.length > 0) {
        if (!cancelled) {
          setRelated(recommended);
          onFirstRelated?.(recommended[0] ?? null);
        }
        return;
      }

      const [sameChannel, sameCategory] = await Promise.all([
        // Prefer the channel's own listing (detail now carries channel_handle);
        // fall back to an empty list if the handle is absent (e.g. a remote card).
        channelHandle
          ? api
              .listChannelVideos(channelHandle, undefined, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
        category
          ? api
              .getFeed({ sort: "recent", category, limit: 20 }, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
      ]);
      // Guard the channel listing against a stale/mismatched channel_id too.
      const channelPicks = sameChannel.filter((v) => !channelId || v.channel_id === channelId);
      const seen = new Set([id]);
      const picks: Video[] = [];
      for (const v of [...channelPicks, ...sameCategory]) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        picks.push(v);
        if (picks.length === RELATED_COUNT) break;
      }
      if (!cancelled) {
        setRelated(picks);
        onFirstRelated?.(picks[0] ?? null);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, channelHandle, channelId, category, onFirstRelated]);

  // While loading, hold the rail's lg-column width with skeleton rows instead
  // of returning null — otherwise the player column renders full-width and
  // then visibly shrinks when the rail pops in. Only the lg+ two-column
  // layout needs the reservation (stacked layouts just append below), so the
  // placeholder stays hidden under lg. A resolved-but-empty list collapses.
  if (related === null) {
    return (
      <aside
        aria-label="Related videos"
        aria-busy="true"
        className={cn(
          "hidden w-full shrink-0 flex-col gap-3.5 lg:flex",
          belowLayout ? null : "lg:w-[344px]",
        )}
      >
        <h2 className="text-[13px] font-bold tracking-[0.02em] text-fg-muted">Related videos</h2>
        <div aria-hidden className="flex flex-col gap-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="aspect-video w-[150px] shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  }
  if (related.length === 0) return null;

  function removeRelated(deleted: Video) {
    const next = related?.filter((item) => item.id !== deleted.id) ?? [];
    setRelated(next);
    onFirstRelated?.(next[0] ?? null);
  }

  return (
    <aside
      aria-label="Related videos"
      className={cn(
        "flex w-full shrink-0 flex-col gap-3.5",
        belowLayout ? null : "lg:w-[344px]",
      )}
    >
      <h2 className="text-[13px] font-bold tracking-[0.02em] text-fg-muted">Related videos</h2>
      <ul
        className={cn(
          "grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2",
          belowLayout ? "lg:grid-cols-3" : "lg:grid-cols-1 lg:gap-y-3.5",
        )}
      >
        {related.map((v) => (
          <li key={v.id}>
            <RelatedRow video={v} onDeleted={() => removeRelated(v)} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

// RelatedRow is the rail's dense row card (150px thumb + text column), per the
// desktop template's UP NEXT list. It keeps the same interactive semantics as
// the feed's VideoCard: one link named by the video title (heading), plus a
// separate channel link. Thumbnail and title are parallel watch links.
function RelatedRow({ video, onDeleted }: { video: Video; onDeleted: () => void }) {
  // ?src=related tags the destination so the watch page emits play_started with
  // context "related" (a non-PII discovery marker; no query text in the URL).
  const {
    isRemote,
    watchHref: href,
    restrictedHidden,
    blurSensitive,
    markSensitive,
    previewEligible,
    previewSrc,
    posterSrc,
    duration,
  } = useVideoCardPresentation(video, { localWatchQuery: "?src=related" });

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  if (restrictedHidden) {
    return (
      <RestrictedModePlaceholder className="min-h-[84px] flex-1 rounded-lg px-3 text-xs" />
    );
  }

  return (
    <div className="group/card flex gap-3">
      <div className="w-[150px] shrink-0">
        {/* hasStoryboard stays false — see useVideoCardPresentation for why no
            card may claim a storyboard its payload never advertised. */}
        <VideoCardPreview
          videoId={video.id}
          title={video.title}
          href={href}
          src={previewSrc}
          poster={posterSrc}
          duration={duration}
          hasStoryboard={false}
          previewEnabled={previewEligible}
          className="rounded-lg"
          posterClassName={cn(
            "transition-transform group-hover/preview:scale-[1.02]",
            blurSensitive && "scale-110 blur-2xl",
          )}
          fallback={
            <div className="media-placeholder absolute inset-0 flex items-center justify-center text-[11px] text-fg-muted">
              No preview
            </div>
          }
          overlay={
            <>
              {markSensitive ? (
                <span
                  title={video.sensitive_reason || undefined}
                  className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white group-data-[preview-active=true]/preview:bottom-10"
                >
                  Sensitive
                </span>
              ) : null}
              {duration !== null ? (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums text-white group-data-[preview-active=true]/preview:bottom-10">
                  {formatDuration(duration)}
                </span>
              ) : null}
            </>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <Link href={href} className="focus-ring rounded">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg">
            {video.title}
          </h3>
        </Link>
        {video.channel_handle ? (
          isRemote ? (
            // Remote channel identity ("name@domain") — not a local channel route.
            <span className="truncate text-xs text-fg-muted">
              {video.channel_display_name || video.channel_handle}
            </span>
          ) : (
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring w-fit max-w-full truncate rounded text-xs text-fg-muted transition-colors hover:text-fg"
            >
              {video.channel_display_name || video.channel_handle}
            </Link>
          )
        ) : null}
        {meta.length > 0 ? (
          <p className="text-xs tabular-nums text-fg-muted">{meta.join(" · ")}</p>
        ) : null}
      </div>
      <div className="-mr-1 shrink-0 self-end opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
        <VideoActionsMenu video={video} compact onDeleted={onDeleted} />
      </div>
    </div>
  );
}
