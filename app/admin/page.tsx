import { AdminOverview } from "@/components/AdminOverview";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminOverviewPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Instance administration at a glance.
      </p>
      <AdminOverview />
    </main>
  );
}
