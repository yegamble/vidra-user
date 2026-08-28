import { AdminConfigNav } from "@/components/AdminConfigNav";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

// The instance-configuration shell (config-parity W2): /admin/config is a
// layout route with a persistent left rail of pages (general | vod | live |
// federation | customization | homepage | ipfs | advanced — lib/admin-config-ia.ts),
// each page rendering its own grouped sections with an in-page anchor rail.
// The bare /admin/config index redirects to /admin/config/general.
export default function AdminConfigLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full max-w-[1200px] flex-1 px-4 py-8 lg:px-8 lg:py-7">
      <PageHeader
        above={<AdminTabs />}
        title="Instance configuration"
        description={
          <>
            Platform information, feature toggles, moderation gates, media distribution, and public
            page content.
          </>
        }
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <AdminConfigNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
