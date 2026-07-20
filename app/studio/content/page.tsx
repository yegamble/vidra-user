import { Suspense } from "react";

import { ContentView } from "@/components/studio/ContentView";

// The Studio Content tab — upload + the current channel's videos. Wrapped in
// Suspense because ContentView reads the URL search params (`?upload=1`).
export default function StudioContentPage() {
  return (
    <Suspense fallback={null}>
      <ContentView />
    </Suspense>
  );
}
