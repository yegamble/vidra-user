import { AdminVideosView } from "@/components/AdminVideosView";
import { PageHeader } from "@/components/PageHeader";

export default function AdminVideosPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="All videos"
        description="Local and federated video inventory, media details, recovery jobs, and moderation actions."
      />
      <AdminVideosView />
    </main>
  );
}
