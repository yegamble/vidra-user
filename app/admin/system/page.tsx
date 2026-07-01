import { AdminSystemStatusView } from "@/components/AdminSystemStatusView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminSystemPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">System status</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Build info, runtime environment, uptime, and dependency health.
      </p>
      <AdminSystemStatusView />
    </main>
  );
}
