import { Suspense } from "react";

import { ChannelRoute } from "@/components/studio/ChannelRoute";

// The Studio Channel tab — manage the current channel (or onboard the first one).
// Wrapped in Suspense because ChannelRoute reads the URL search params
// (`?create=1`).
export default function StudioChannelPage() {
  return (
    <Suspense fallback={null}>
      <ChannelRoute />
    </Suspense>
  );
}
