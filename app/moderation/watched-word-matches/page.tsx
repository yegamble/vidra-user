import { WatchedWordMatchesView } from "@/components/WatchedWordMatchesView";

export default function WatchedWordMatchesPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Word matches</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Comments flagged by the watched-words list when they were posted, newest first.
        </p>
      </header>
      <WatchedWordMatchesView />
    </main>
  );
}
