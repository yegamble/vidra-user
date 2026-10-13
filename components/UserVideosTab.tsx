"use client";

import { ChannelVideoGrid } from "@/components/ChannelVideoGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";

// UserVideosTab is the profile's Videos tab: every public video across all of
// the account's channels, in the same grid and through the same append seam as
// a channel page. The server applies the visibility rules.
export function UserVideosTab({ username, name }: { username: string; name: string }) {
  const autoLoad = useBrowseAutoLoad();
  const list = useAppendingList<Video>({
    queryKey: `user-videos:${username}`,
    getId: (v) => v.id,
    load: (window, signal) =>
      api.listUserVideos(username, signal, window).then((res) => ({ items: res.videos, total: res.total })),
  });

  if (list.status === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading videos" />
      </div>
    );
  }
  if (list.status === "error") {
    return <ErrorState message="Could not load this account's videos." onRetry={list.reload} />;
  }
  if (list.items.length === 0) {
    return <EmptyState title="No videos yet" message="This account has not published anything." />;
  }
  return (
    <div className="flex flex-col gap-5">
      <ChannelVideoGrid videos={list.items} label={`Videos by ${name}`} />
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? "Could not load more videos." : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
