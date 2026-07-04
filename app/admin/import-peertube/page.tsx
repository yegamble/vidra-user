import { AdminPeerTubeImportView } from "@/components/AdminPeerTubeImportView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminImportPeerTubePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Import from PeerTube</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Migrate an existing PeerTube instance into Vidra. Preview with a dry run, then launch and
        monitor the one-way import. The source connection comes from the server configuration.
      </p>
      <AdminPeerTubeImportView />
    </main>
  );
}
