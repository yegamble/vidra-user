import type { Metadata } from "next";

import { WatchView } from "@/components/WatchView";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { getPublicVideo } from "@/lib/video.server";
import { buildWatchMetadata } from "@/lib/watch-metadata";

// Watch-page social metadata (config-parity W15, completing W4's og:image
// precedence): the video is fetched server-side ONLY for metadata — title,
// description, and the thumbnail-first og:image/twitter card. A missing or
// private video (public GET 404s) or an unreachable backend emits nothing, so
// the layout's instance defaults stand and the page renders normally.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [video, instance] = await Promise.all([getPublicVideo(id), getInstanceConfig()]);
  return buildWatchMetadata(video, instance);
}

// The watch page is the destination feed cards link to. The video itself loads
// client-side in WatchView (route-mockable, refetchable); this server component
// just resolves the dynamic id.
export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
      <WatchView id={id} />
    </main>
  );
}
