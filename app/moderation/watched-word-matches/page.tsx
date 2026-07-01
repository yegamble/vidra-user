import { ModerationTabs } from "@/components/ModerationTabs";
import { WatchedWordMatchesView } from "@/components/WatchedWordMatchesView";

export default function WatchedWordMatchesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Comments flagged by the watched-words list when they were posted, newest first.
      </p>
      <ModerationTabs />
      <WatchedWordMatchesView />
    </main>
  );
}
