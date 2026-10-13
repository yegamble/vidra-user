"use client";

import { useT } from "@/components/I18nProvider";
import { PlaylistIcon } from "@/components/icons";
import { PlaylistCard } from "@/components/PlaylistCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Playlist } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";

// ChannelPlaylistsTab is the channel page's Playlists tab. The server decides
// what the viewer may see (public ones for everyone, the owner's own unlisted
// and private ones for the owner), so this renders whatever comes back. Paging
// goes through the shared append seam, like the channel's videos.
export function ChannelPlaylistsTab({ handle, name }: { handle: string; name: string }) {
  const t = useT();
  const autoLoad = useBrowseAutoLoad();
  const list = useAppendingList<Playlist>({
    queryKey: `channel-playlists:${handle}`,
    getId: (p) => p.id,
    load: (window, signal) =>
      api.listChannelPlaylists(handle, signal, window).then((res) => ({ items: res.playlists, total: res.total })),
  });

  if (list.status === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t("channel.playlists.loading")} />
      </div>
    );
  }
  if (list.status === "error") {
    return <ErrorState message={t("channel.playlists.error")} onRetry={list.reload} />;
  }
  if (list.items.length === 0) {
    return (
      <EmptyState
        icon={<PlaylistIcon size={24} />}
        title={t("channel.playlists.empty.title")}
        message={t("channel.playlists.empty.message")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <ul
        aria-label={t("channel.playlists.label", { name })}
        className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {list.items.map((pl) => (
          <li key={pl.id}>
            <PlaylistCard playlist={pl} />
          </li>
        ))}
      </ul>
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? t("channel.playlists.moreError") : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
