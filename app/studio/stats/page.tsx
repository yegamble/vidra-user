import { StudioStatsView } from "@/components/StudioStatsView";

export default function StudioStatsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-title sm:text-large-title">Creator stats</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Engagement totals and the last 30 days of views for your channels and videos.
      </p>
      <StudioStatsView />
    </main>
  );
}
