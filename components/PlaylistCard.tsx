import Link from "next/link";

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
        className="group flex flex-col gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
      >
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
          {playlist.has_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- backend-served cover, not a static asset
            <img
              src={playlistThumbnailUrl(playlist.id)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            /* Minified inline stacked-list icon as the cover placeholder */
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-8 w-8 text-zinc-400 dark:text-zinc-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 5h12M3 10h12M3 15h12M18 5v10.55A4 4 0 1 0 20 19V7h3V5z" />
            </svg>
          )}
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 text-[11px] font-medium leading-none text-white">
            {playlist.video_count} {playlist.video_count === 1 ? "video" : "videos"}
          </span>
        </div>
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-100 dark:group-hover:text-zinc-300">
          {playlist.title}
        </h3>
      </Link>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <PrivacyBadge privacy={playlist.visibility} />
        {updated ? <span>Updated {updated}</span> : null}
      </div>
    </div>
  );
}
