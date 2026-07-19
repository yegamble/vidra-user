import { BlockedVideosTabs } from "@/components/BlockedVideosTabs";
import { BlockedVideosView } from "@/components/BlockedVideosView";

export default function BlockedVideosPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Blocked videos</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Videos blocked by moderators are hidden from public surfaces and listed here.
        </p>
      </header>
      <BlockedVideosTabs />
      <BlockedVideosView />
    </main>
  );
}
