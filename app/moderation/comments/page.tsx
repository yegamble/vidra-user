import { AdminCommentsView } from "@/components/AdminCommentsView";
import { PageHeader } from "@/components/PageHeader";

export default function AdminCommentsPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Comments"
        description="Every comment on the instance. Delete any that violate the rules."
      />
      <AdminCommentsView />
    </main>
  );
}
