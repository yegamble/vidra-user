import { AdminFederationInstancesView } from "@/components/AdminFederationInstancesView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

// Instance follows (PeerTube's /server/following + /server/followers): this
// instance's actor follows other instances, and other instances follow it.
export default function AdminFederationInstancesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Federation"
        description={
          <>
            Follow other PeerTube or vidra instances to receive their public videos, and decide which
            instances may follow this one. Applies to ActivityPub only. Blocked instances are managed
            in Moderation.
          </>
        }
      />
      <AdminFederationInstancesView />
    </main>
  );
}
