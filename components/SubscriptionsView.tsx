"use client";


import { useSession } from "@/components/auth/AuthProvider";
import { UsersIcon } from "@/components/icons";
import { RemoteFollowsSection } from "@/components/RemoteFollowsSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { VideoGrid } from "@/components/VideoGrid";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";
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
  const {
    status,
    data,
    retry,
    setData: setVideos,
  } = useApiResource<Video[]>((signal) =>
    api.getSubscriptionVideos({}, signal).then((res) => res.videos),
  );
  const videos = data ?? [];

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading subscriptions" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your subscriptions." onRetry={retry} />;
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
    <VideoGrid>
      {videos.map((video) => (
        <li key={video.id}>
          <VideoCard
            video={video}
            onDeleted={() => setVideos((cur) => (cur ?? []).filter((v) => v.id !== video.id))}
          />
        </li>
      ))}
    </VideoGrid>
  );
}
