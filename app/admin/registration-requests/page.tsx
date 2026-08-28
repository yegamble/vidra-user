import { AdminRegistrationRequestsView } from "@/components/AdminRegistrationRequestsView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminRegistrationRequestsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Registration requests"
        description={
          <>
            Review signups awaiting approval: approving creates the account, rejecting records an
            optional internal note.
          </>
        }
      />
      <AdminRegistrationRequestsView />
    </main>
  );
}
