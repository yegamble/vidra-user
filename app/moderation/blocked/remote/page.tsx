import { BlockedRemoteVideosView } from "@/components/BlockedRemoteVideosView";
import { BlockedVideosTabs } from "@/components/BlockedVideosTabs";
import { PageHeader } from "@/components/PageHeader";

export default function BlockedRemoteVideosPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Blocked videos"
        description={
          <>
            Federated videos blocked by moderators are hidden from all local surfaces (feeds, search,
            and the remote watch page) and listed here.
          </>
        }
      />
      <BlockedVideosTabs />
      <BlockedRemoteVideosView />
    </main>
  );
}
