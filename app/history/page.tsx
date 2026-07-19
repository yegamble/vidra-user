import { PageShell } from "@/components/PageShell";
import { WatchHistoryView } from "@/components/WatchHistoryView";

export default function HistoryPage() {
  return (
    <PageShell className="py-8">
      <h1 className="mb-6 text-title sm:text-large-title">History</h1>
      <WatchHistoryView />
    </PageShell>
  );
}
