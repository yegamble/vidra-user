import { AdminMediaView } from "@/components/AdminMediaView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminMediaPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Media storage</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Garbage-collect stored media objects with no database reference.
      </p>
      <AdminMediaView />
    </main>
  );
}
