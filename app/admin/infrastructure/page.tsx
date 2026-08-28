import { AdminInfrastructureView } from "@/components/AdminInfrastructureView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminInfrastructurePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Infrastructure"
        description={
          <>
            How this instance is deployed: server limits, storage, networking,
            backups, and the optional features you have switched on.
          </>
        }
      />
      <AdminInfrastructureView />
    </main>
  );
}
