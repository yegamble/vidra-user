import { AdminAuditLogView } from "@/components/AdminAuditLogView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminAuditLogPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Audit log"
        description={
          <>
            The durable trail of security-sensitive actions (auth, moderation, admin,
            registration). Filter by action; newest first.
          </>
        }
      />
      <AdminAuditLogView />
    </main>
  );
}
