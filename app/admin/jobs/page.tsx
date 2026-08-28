import { AdminJobsView } from "@/components/AdminJobsView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminJobsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Jobs"
        description="Queue health plus individual, correlated background-work execution history."
      />
      <AdminJobsView />
    </main>
  );
}
