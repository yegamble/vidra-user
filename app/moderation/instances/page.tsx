import { AdminInstancesView } from "@/components/AdminInstancesView";
import { ModerationTabs } from "@/components/ModerationTabs";

export default function ModerationInstancesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Federated instances blocked on this server: inbound activity is dropped, their content is
        hidden everywhere, and deliveries to them are cancelled.
      </p>
      <ModerationTabs />
      <AdminInstancesView />
    </main>
  );
}
