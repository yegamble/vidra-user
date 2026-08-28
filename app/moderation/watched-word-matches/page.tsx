import { WatchedWordMatchesView } from "@/components/WatchedWordMatchesView";
import { PageHeader } from "@/components/PageHeader";

export default function WatchedWordMatchesPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Word matches"
        description="Comments flagged by the watched-words list when they were posted, newest first."
      />
      <WatchedWordMatchesView />
    </main>
  );
}
