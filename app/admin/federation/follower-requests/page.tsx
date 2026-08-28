import { AdminFederationFollowerRequestsView } from "@/components/AdminFederationFollowerRequestsView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

// The federation follower-approval queue (config-parity W12/W15). While the
// federation_follower_approval setting is on, new inbound ActivityPub channel
// Follows are held pending for an admin decision here.
export default function AdminFederationFollowerRequestsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Follower requests"
        description={
          <>
            Review remote accounts asking to follow local channels: approving sends the Accept the
            remote has been waiting on, rejecting removes the pending follow. Applies to ActivityPub
            only, and only while follower approval is enabled in Federation settings.
          </>
        }
      />
      <AdminFederationFollowerRequestsView />
    </main>
  );
}
