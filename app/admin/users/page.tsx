import { AdminTabs } from "@/components/AdminTabs";
import { AdminUsersView } from "@/components/AdminUsersView";

export default function AdminUsersPage() {
  return (
    <main className="w-full max-w-[1100px] flex-1 px-4 py-8 lg:px-8 lg:py-7">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Users</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Search accounts and manage their role and active status.
      </p>
      <AdminUsersView />
    </main>
  );
}
