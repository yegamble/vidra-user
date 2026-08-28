import { AdminMediaView } from "@/components/AdminMediaView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminMediaPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Media storage"
        description="Garbage-collect stored media objects with no database reference."
      />
      <AdminMediaView />
    </main>
  );
}
