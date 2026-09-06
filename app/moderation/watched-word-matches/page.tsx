import { WatchedWordMatchesView } from "@/components/WatchedWordMatchesView";
import { PageHeader } from "@/components/PageHeader";

export default function WatchedWordMatchesPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Word matches"
        description="Comments and videos flagged by the watched-words list when they were posted or edited, newest first. Flagging records a match for review — it does not hide the content."
      />
      <WatchedWordMatchesView />
    </main>
  );
}
