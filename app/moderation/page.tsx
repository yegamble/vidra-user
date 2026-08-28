import { ModerationQueue } from "@/components/ModerationQueue";
import { PageHeader } from "@/components/PageHeader";

export default function ModerationPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Reports"
        description="Review and resolve abuse reports filed by viewers."
      />
      <ModerationQueue />
    </main>
  );
}
