import { AdminPeerTubeImportView } from "@/components/AdminPeerTubeImportView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminImportPeerTubePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Import from PeerTube"
        description={
          <>
            Migrate an existing PeerTube instance into Vidra. Preview with a dry run, then launch and
            monitor the one-way import. The source connection comes from the server configuration.
          </>
        }
      />
      <AdminPeerTubeImportView />
    </main>
  );
}
