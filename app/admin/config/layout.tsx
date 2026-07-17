import { AdminConfigNav } from "@/components/AdminConfigNav";
import { AdminTabs } from "@/components/AdminTabs";

// The instance-configuration shell (config-parity W2): /admin/config is a
// layout route with a persistent left rail of pages (general | vod | live |
// federation | customization | homepage | ipfs | advanced — lib/admin-config-ia.ts),
// each page rendering its own grouped sections with an in-page anchor rail.
// The bare /admin/config index redirects to /admin/config/general.
export default function AdminConfigLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full max-w-[1200px] flex-1 px-4 py-8 lg:px-8 lg:py-7">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Instance configuration</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Platform information, feature toggles, moderation gates, media distribution, and public
        page content.
      </p>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <AdminConfigNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
