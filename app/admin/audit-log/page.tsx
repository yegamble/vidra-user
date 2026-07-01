import { AdminAuditLogView } from "@/components/AdminAuditLogView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminAuditLogPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        The durable trail of security-sensitive actions (auth, moderation, admin,
        registration). Filter by action; newest first.
      </p>
      <AdminAuditLogView />
    </main>
  );
}
