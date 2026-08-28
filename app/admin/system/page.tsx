import { AdminSystemStatusView } from "@/components/AdminSystemStatusView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminSystemPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="System status"
        description="Build info, runtime environment, uptime, and dependency health."
      />
      <AdminSystemStatusView />
    </main>
  );
}
