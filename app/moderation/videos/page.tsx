import { AdminVideosView } from "@/components/AdminVideosView";

export default function AdminVideosPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">All videos</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Local and federated video inventory, media details, recovery jobs, and moderation actions.
        </p>
      </header>
      <AdminVideosView />
    </main>
  );
}
