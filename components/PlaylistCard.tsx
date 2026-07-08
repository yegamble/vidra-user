import Link from "next/link";

import { PlaylistIcon } from "@/components/icons";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { playlistThumbnailUrl, type Playlist } from "@/lib/api";
import { relativeTime } from "@/lib/format";

// PlaylistCard is the grid card for a playlist (used on /playlists): the uploaded
// cover image when one is set (else a stacked-list placeholder), the video count
// badge, the title, a Private/Unlisted badge for non-public playlists, and the
// last-updated time. The whole title links to the playlist detail page.
export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const updated = relativeTime(playlist.updated_at);
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/playlists/${playlist.id}`}
        className="focus-ring group flex flex-col gap-2 rounded-xl"
      >
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
          {playlist.has_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- backend-served cover, not a static asset
            <img
              src={playlistThumbnailUrl(playlist.id)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            /* Design's filled playlist glyph as the cover placeholder */
            <PlaylistIcon size={32} className="text-fg-muted" />
          )}
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums">
            {playlist.video_count} {playlist.video_count === 1 ? "video" : "videos"}
          </span>
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold text-fg transition-colors group-hover:text-fg-muted">
          {playlist.title}
        </h3>
      </Link>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        <PrivacyBadge privacy={playlist.visibility} />
        {updated ? <span>Updated {updated}</span> : null}
      </div>
    </div>
  );
}
