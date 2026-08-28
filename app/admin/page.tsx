import { AdminOverview } from "@/components/AdminOverview";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminOverviewPage() {
  return (
    <main className="w-full max-w-[1100px] flex-1 px-4 py-8 lg:px-8 lg:py-7">
      {/* "Overview" — the registry's name for this destination (lib/admin-nav.ts),
          so the rail's lit entry and the mobile Select's selected label match
          the page heading. */}
      <PageHeader
        above={<AdminTabs />}
        title="Overview"
        description="Instance administration at a glance."
      />
      <AdminOverview />
    </main>
  );
}
