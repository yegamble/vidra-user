import { AdminBlockedRemoteActorsView } from "@/components/AdminBlockedRemoteActorsView";
import { PageHeader } from "@/components/PageHeader";

export default function ModerationAccountsPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Remote accounts"
        description={
          <>
            Remote accounts blocked on this server. A proportionate alternative to blocking their
            whole instance: only that account&rsquo;s videos and comments are hidden, and its
            follows and replies are refused.
          </>
        }
      />
      <AdminBlockedRemoteActorsView />
    </main>
  );
}
