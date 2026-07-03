import { ModerationTabs } from "@/components/ModerationTabs";
import { QuarantineQueueView } from "@/components/QuarantineQueueView";

export default function QuarantinePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        New uploads held for review, newest first. Approving publishes the video; rejecting
        fails it and notifies the owner.
      </p>
      <ModerationTabs />
      <QuarantineQueueView />
    </main>
  );
}
