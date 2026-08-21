import { AdminInfrastructureView } from "@/components/AdminInfrastructureView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminInfrastructurePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Infrastructure</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        How this instance is deployed: server limits, storage, networking,
        backups, and the optional features you have switched on.
      </p>
      <AdminInfrastructureView />
    </main>
  );
}
