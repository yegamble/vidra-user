import { AdminInstancesView } from "@/components/AdminInstancesView";

export default function ModerationInstancesPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Instances</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Federated instances blocked on this server: inbound activity is dropped, their content is
          hidden everywhere, and deliveries to them are cancelled.
        </p>
      </header>
      <AdminInstancesView />
    </main>
  );
}
