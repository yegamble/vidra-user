import { FeedSortTabs } from "@/components/FeedSortTabs";
import { VideoFeed } from "@/components/VideoFeed";
import type { FeedSort } from "@/lib/api";

const HEADINGS: Record<FeedSort, string> = {
  recent: "Recent videos",
  popular: "Popular videos",
  trending: "Trending videos",
};

// Unknown ?sort= values fall back to recent, mirroring the backend's behavior.
function toFeedSort(value: string | undefined): FeedSort {
  return value === "popular" || value === "trending" ? value : "recent";
}

// The home feed. The active sort mode lives in the URL (?sort=recent|popular|
// trending) so a mode is shareable and back-button friendly; the sort control
// pushes a new URL and this server page re-renders the heading + feed.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const active = toFeedSort(sort);
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{HEADINGS[active]}</h1>
        <FeedSortTabs active={active} />
      </div>
      <VideoFeed key={active} sort={active} />
    </main>
  );
}
