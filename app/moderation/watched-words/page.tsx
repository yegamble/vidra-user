import { WatchedWordsView } from "@/components/WatchedWordsView";
import { PageHeader } from "@/components/PageHeader";

export default function WatchedWordsPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Watched words"
        description="Instance-wide watched words. Content containing a watched term can be flagged for review."
      />
      <WatchedWordsView />
    </main>
  );
}
