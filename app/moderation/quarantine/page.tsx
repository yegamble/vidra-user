import { QuarantineQueueView } from "@/components/QuarantineQueueView";

export default function QuarantinePage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Quarantine</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          New uploads held for review, newest first. Approving publishes the video; rejecting
          fails it and notifies the owner.
        </p>
      </header>
      <QuarantineQueueView />
    </main>
  );
}
