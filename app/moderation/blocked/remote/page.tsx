import { BlockedRemoteVideosView } from "@/components/BlockedRemoteVideosView";
import { BlockedVideosTabs } from "@/components/BlockedVideosTabs";
import { ModerationTabs } from "@/components/ModerationTabs";

export default function BlockedRemoteVideosPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Federated videos blocked by moderators are hidden from all local surfaces (feeds, search,
        and the remote watch page) and listed here.
      </p>
      <ModerationTabs />
      <BlockedVideosTabs />
      <BlockedRemoteVideosView />
    </main>
  );
}
