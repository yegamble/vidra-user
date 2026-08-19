import { ChannelView } from "@/components/ChannelView";
import { apiBaseUrl } from "@/lib/config";

// Per-channel RSS auto-discovery (Wave F F3): the channel-filtered public feed
// on vidra-core is {apiBaseUrl}/feeds/videos.xml?channel={handle} — root-
// relative when the base is same-origin (""). A plain <link> (React 19 hoists
// it into <head>) rather than metadata `alternates`, which Next would
// absolutize against a metadataBase this page cannot know.
export default async function ChannelPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const feedUrl = `${apiBaseUrl}/feeds/videos.xml?channel=${encodeURIComponent(handle)}`;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-4 sm:pt-6">
      <link rel="alternate" type="application/rss+xml" title={`${handle} — Videos`} href={feedUrl} />
      <ChannelView key={handle} handle={handle} />
    </main>
  );
}
