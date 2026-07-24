import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { LinkButton } from "@/components/ui/LinkButton";
import { channelAvatarUrl, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";

// FeaturedBanner is the admin-controlled home masthead (spec: WAVE C2 — the only
// intentional "featured" slot; the accidental latest-upload hero was removed in
// Wave B). It is a SERVER component: the home page resolves the picked video +
// admin overrides before HTML streams (lib/featured.server.ts) and hands them in,
// so there is zero pop-in and no client fetch.
//
// Presentation follows vidra's own design tokens, NOT a YouTube reskin: a
// rounded-2xl bg-surface shadow-soft card. YouTube familiarity is structural — a
// horizontal masthead (media left, panel right) on desktop, stacked on mobile —
// held to a strict size budget so the shelves/chips/grid stay visible below it
// (media never full-viewport; the whole banner stays compact). A visible
// Featured/Sponsored chip always sits at the top of the panel. The media block
// and the CTA both link to the watch page; the title is plain text so the panel
// carries no nested anchors (the channel line is its own quiet link).
//
// v1 is local videos only, one slot, a static poster (no autoplay). Overrides
// that arrive empty ("") fall back to the video's own fields (title/description)
// or the frontend CTA default.
export function FeaturedBanner({
  video,
  title,
  description,
  ctaLabel,
  label,
}: {
  video: Video;
  /** Title override; empty/absent falls back to the video's title. */
  title?: string;
  /** Description override; empty/absent falls back to the video's description. */
  description?: string;
  /** CTA button label override; empty/absent uses "Watch now". */
  ctaLabel?: string;
  label: "featured" | "sponsored";
}) {
  const href = `/videos/${video.id}`;
  const heading = (title && title.trim()) || video.title;
  const blurb = (description && description.trim()) || video.description || "";
  const cta = (ctaLabel && ctaLabel.trim()) || "Watch now";
  const chipLabel = label === "sponsored" ? "Sponsored" : "Featured";

  const poster = video.has_thumbnail ? videoThumbnailUrl(video.id) : null;
  const channelName = video.channel_display_name || video.channel_handle || "";
  const avatarSrc = video.channel_handle ? channelAvatarUrl(video.channel_handle) : null;

  return (
    <section
      aria-label={`${chipLabel}: ${heading}`}
      data-testid="featured-banner"
      className="overflow-hidden rounded-2xl bg-surface shadow-soft"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Media (whole area links to the watch page). Capped so the masthead
            stays compact — grid stays visible below on an 800px-tall desktop. */}
        <Link
          href={href}
          aria-label={heading}
          className="focus-ring group/media relative block aspect-video w-full shrink-0 overflow-hidden bg-surface-muted sm:w-[44%] sm:max-w-[480px]"
        >
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover/media:scale-[1.03]"
            />
          ) : (
            <div className="media-placeholder absolute inset-0">
              <span className="sr-only">No preview</span>
            </div>
          )}
        </Link>

        {/* Panel: chip → title → description → channel → CTA. min-w-0 so the
            2-line clamps and the truncating channel line never blow out width. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5 lg:p-6">
          <span className="inline-flex w-fit items-center rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
            {chipLabel}
          </span>
          <h2 className="line-clamp-2 text-title2 font-bold text-fg">{heading}</h2>
          {blurb ? (
            <p className="line-clamp-2 text-subhead text-fg-muted">{blurb}</p>
          ) : null}
          {channelName ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar src={avatarSrc} name={channelName} className="h-7 w-7 shrink-0 text-[12px]" />
              {video.channel_handle && video.remote !== true ? (
                <Link
                  href={`/channels/${video.channel_handle}`}
                  className="focus-ring min-w-0 truncate rounded-sm text-footnote font-medium text-fg-muted transition-colors hover:text-fg"
                >
                  {channelName}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-footnote font-medium text-fg-muted">
                  {channelName}
                </span>
              )}
            </div>
          ) : null}
          <div className="mt-1">
            <LinkButton href={href} size="sm" aria-label={`${cta}: ${heading}`}>
              {cta}
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}
