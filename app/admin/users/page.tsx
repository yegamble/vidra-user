import { AdminTabs } from "@/components/AdminTabs";
import { AdminUsersView } from "@/components/AdminUsersView";
import { PageHeader } from "@/components/PageHeader";

export default function AdminUsersPage() {
  return (
    <main className="w-full max-w-[1100px] flex-1 px-4 py-8 lg:px-8 lg:py-7">
      <PageHeader
        above={<AdminTabs />}
        title="Users"
        description="Search accounts and manage their role and active status."
      />
      <AdminUsersView />
    </main>
  );
}
