import { AnalyticsView } from "@/components/studio/AnalyticsView";

// The Studio Analytics tab — creator stats at the "This channel" and
// "All channels" scopes, plus per-video stats. The shared studio layout supplies
// the title, session gate, channel provider, and nav.
export default function StudioAnalyticsPage() {
  return <AnalyticsView />;
}
