import { BlockedRemoteVideosView } from "@/components/BlockedRemoteVideosView";
import { BlockedVideosTabs } from "@/components/BlockedVideosTabs";

export default function BlockedRemoteVideosPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Blocked videos</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Federated videos blocked by moderators are hidden from all local surfaces (feeds, search,
          and the remote watch page) and listed here.
        </p>
      </header>
      <BlockedVideosTabs />
      <BlockedRemoteVideosView />
    </main>
  );
}
