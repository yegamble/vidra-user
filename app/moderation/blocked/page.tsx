import { BlockedVideosTabs } from "@/components/BlockedVideosTabs";
import { BlockedVideosView } from "@/components/BlockedVideosView";
import { PageHeader } from "@/components/PageHeader";

export default function BlockedVideosPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Blocked videos"
        description="Videos blocked by moderators are hidden from public surfaces and listed here."
      />
      <BlockedVideosTabs />
      <BlockedVideosView />
    </main>
  );
}
