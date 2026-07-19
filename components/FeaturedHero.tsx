import Link from "next/link";

import { remoteVideoThumbnailUrl, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";

// FeaturedHero is the home page's Apple-TV-style hero: the newest published
// video rendered as one large 16:9 card with the poster full-bleed behind a
// bottom scrim, the title in the large-title ramp, and a quiet channel/meta
// line. The whole card is a single link to the watch surface (so the channel is
// plain text here, not a nested anchor). It is a server component seeded from
// the same feed fetch as the grid below — the home page hands it the first
// video and tells `VideoFeed` to omit that id, so it never appears twice.
//
// The white-on-scrim text is a sanctioned media overlay (it sits on imagery,
// not on a themed surface), matching the duration/LIVE pills elsewhere. The
// poster zoom on hover is clipped by the card's own overflow so the hero never
// grows past the page (no horizontal overflow); reduced-motion neutralizes it
// globally.
export function FeaturedHero({ video }: { video: Video }) {
  const isRemote = video.remote === true;
  const href = isRemote ? `/remote/${video.id}` : `/videos/${video.id}`;
  const poster = video.has_thumbnail
    ? isRemote
      ? remoteVideoThumbnailUrl(video.id)
      : videoThumbnailUrl(video.id)
    : null;
  const channel = video.channel_display_name || video.channel_handle || "";

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  return (
    <section aria-labelledby="home-hero-heading">
      <Link
        href={href}
        aria-label={video.title}
        className="focus-ring group/hero relative block aspect-video w-full overflow-hidden rounded-2xl bg-surface-muted shadow-soft"
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover/hero:scale-[1.03]"
          />
        ) : (
          <div className="media-placeholder absolute inset-0" />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:p-7">
          <h2
            id="home-hero-heading"
            className="line-clamp-2 max-w-3xl text-title font-bold text-white sm:text-large-title"
          >
            {video.title}
          </h2>
          {channel || meta.length > 0 ? (
            <p className="text-subhead text-white/85">
              {channel}
              {channel && meta.length > 0 ? <span aria-hidden> · </span> : null}
              {meta.length > 0 ? <span className="tabular-nums">{meta.join(" · ")}</span> : null}
            </p>
          ) : null}
        </div>
      </Link>
    </section>
  );
}
