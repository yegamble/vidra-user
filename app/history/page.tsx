import { PageShell } from "@/components/PageShell";
import { WatchHistoryView } from "@/components/WatchHistoryView";

export default function HistoryPage() {
  return (
    <PageShell className="py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">History</h1>
      <WatchHistoryView />
    </PageShell>
  );
}
