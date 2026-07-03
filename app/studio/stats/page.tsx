import { StudioStatsView } from "@/components/StudioStatsView";

export default function StudioStatsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Creator stats</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Engagement totals and the last 30 days of views for your channels and videos.
      </p>
      <StudioStatsView />
    </main>
  );
}
