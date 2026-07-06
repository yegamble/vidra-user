import { BlockedVideosTabs } from "@/components/BlockedVideosTabs";
import { BlockedVideosView } from "@/components/BlockedVideosView";
import { ModerationTabs } from "@/components/ModerationTabs";

export default function BlockedVideosPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Videos blocked by moderators are hidden from public surfaces and listed here.
      </p>
      <ModerationTabs />
      <BlockedVideosTabs />
      <BlockedVideosView />
    </main>
  );
}
