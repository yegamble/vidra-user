import type { Metadata } from "next";

import { ChannelView } from "@/components/ChannelView";
import { apiBaseUrl } from "@/lib/config";

// Per-channel RSS auto-discovery (Wave F F3): the channel-filtered public feed
// on vidra-core is {apiBaseUrl}/feeds/videos.xml?channel={handle}. Emitting only
// `alternates` here merges with the root layout's title/description/icons.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const feedUrl = `${apiBaseUrl}/feeds/videos.xml?channel=${encodeURIComponent(handle)}`;
  return {
    alternates: {
      types: { "application/rss+xml": [{ url: feedUrl, title: `${handle} — Videos` }] },
    },
  };
}

export default async function ChannelPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-4 sm:pt-6">
      <ChannelView key={handle} handle={handle} />
    </main>
  );
}
