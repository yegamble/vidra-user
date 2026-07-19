import { WatchedWordsView } from "@/components/WatchedWordsView";

export default function WatchedWordsPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Watched words</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Instance-wide watched words. Content containing a watched term can be flagged for review.
        </p>
      </header>
      <WatchedWordsView />
    </main>
  );
}
