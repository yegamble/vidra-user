import { FeedSortTabs } from "@/components/FeedSortTabs";
import { VideoFeed } from "@/components/VideoFeed";

// /trending is the canonical trending surface: the public feed with
// sort=trending preselected, sharing the home page's segmented sort control
// (Recent/Popular link back to the home feed modes) and the VideoFeed grid.
// The home page's ?sort=trending deep link keeps working; this route is the
// linkable navigation destination (sidebar entry, PeerTube parity).
export default function TrendingPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trending videos</h1>
        <FeedSortTabs active="trending" />
      </div>
      <VideoFeed sort="trending" />
    </main>
  );
}
