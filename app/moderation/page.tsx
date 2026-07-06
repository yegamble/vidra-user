import { ModerationQueue } from "@/components/ModerationQueue";
import { ModerationTabs } from "@/components/ModerationTabs";

export default function ModerationPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Moderation</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Review and resolve abuse reports filed by viewers.
      </p>
      <ModerationTabs />
      <ModerationQueue />
    </main>
  );
}
