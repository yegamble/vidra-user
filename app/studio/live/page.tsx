import { Suspense } from "react";

import { LiveView } from "@/components/studio/LiveView";

// The Studio Live tab — the current channel's live streams. Wrapped in Suspense
// because LiveView reads the URL search params (`?new=1`).
export default function StudioLivePage() {
  return (
    <Suspense fallback={null}>
      <LiveView />
    </Suspense>
  );
}
