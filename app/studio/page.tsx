import { Suspense } from "react";

import { DashboardRoute } from "@/components/studio/DashboardRoute";

// The Studio dashboard. The shared studio layout provides the page title, the
// session gate, the channel provider, and the tab strip; this route renders the
// dashboard (or the `?video=` single-video management surface). Wrapped in
// Suspense because DashboardRoute reads the URL search params.
export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRoute />
    </Suspense>
  );
}
