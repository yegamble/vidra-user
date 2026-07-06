import { ModerationTabs } from "@/components/ModerationTabs";
import { WatchedWordsView } from "@/components/WatchedWordsView";

export default function WatchedWordsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Instance-wide watched words. Content containing a watched term can be flagged for review.
      </p>
      <ModerationTabs />
      <WatchedWordsView />
    </main>
  );
}
