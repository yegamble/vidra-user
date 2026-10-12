"use client";


import { useSession } from "@/components/auth/AuthProvider";
import { UsersIcon } from "@/components/icons";
import { RemoteFollowsSection } from "@/components/RemoteFollowsSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { VideoGrid } from "@/components/VideoGrid";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";
import { SignInGate } from "@/components/SignInGate";

// SubscriptionsView shows the signed-in user's feed of videos from the channels
// they follow — local channels and accepted remote-channel follows (remote:true
// cards with an origin badge), plus the remote-follows affordance above the
// feed. The session lives in memory, so a hard reload lands here signed out —
// we show a sign-in prompt rather than fetching.
export function SubscriptionsView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <SignInGate icon={<UsersIcon size={24} />} title="Sign in to see your subscriptions">
        to follow channels and watch their latest videos here.
      </SignInGate>
    );
  }

  return (
    <>
      <RemoteFollowsSection />
      <Feed />
    </>
  );
}

function Feed() {
  const autoLoad = useBrowseAutoLoad();
  // Paged from the server; the feed used to stop at the backend's default 20.
  const list = useAppendingList<Video>({
    queryKey: "subscriptions",
    getId: (v) => v.id,
    load: (window, signal) =>
      api
        .getSubscriptionVideos(window, signal)
        .then((res) => ({ items: res.videos, total: res.total })),
  });
  const { status, items: videos } = list;

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading subscriptions" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your subscriptions." onRetry={list.reload} />;
  }
  if (videos.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon size={24} />}
        title="No videos from your subscriptions yet"
        message="Subscribe to channels and their latest videos will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <VideoGrid>
        {videos.map((video) => (
          <li key={video.id}>
            <VideoCard video={video} onDeleted={() => list.drop((v) => v.id !== video.id)} />
          </li>
        ))}
      </VideoGrid>
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
