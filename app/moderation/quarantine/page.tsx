import { QuarantineQueueView } from "@/components/QuarantineQueueView";
import { PageHeader } from "@/components/PageHeader";

export default function QuarantinePage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Quarantine"
        description={
          <>
            New uploads held for review, newest first. Approving publishes the video; rejecting
            fails it and notifies the owner.
          </>
        }
      />
      <QuarantineQueueView />
    </main>
  );
}
