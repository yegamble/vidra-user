import { AdminInstancesView } from "@/components/AdminInstancesView";
import { PageHeader } from "@/components/PageHeader";

export default function ModerationInstancesPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Instances"
        description={
          <>
            Federated instances blocked on this server: inbound activity is dropped, their content is
            hidden everywhere, and deliveries to them are cancelled.
          </>
        }
      />
      <AdminInstancesView />
    </main>
  );
}
