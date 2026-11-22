import { RoleGate } from "@/components/RoleGate";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader above={<AdminTabs />} title="Pages" />
      <RoleGate minRole="admin" action="manage custom pages">{children}</RoleGate>
    </main>
  );
}
