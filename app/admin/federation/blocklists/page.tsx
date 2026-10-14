import { AdminBlocklistSubscriptionsView } from "@/components/AdminBlocklistSubscriptionsView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

// Blocklist subscriptions: shared fediverse denylists (Mastodon CSV, domain
// list, JSON) synced into the instance blocklist. Admin-only.
export default function AdminBlocklistSubscriptionsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Blocklist subscriptions"
        description={
          <>
            Subscribe to a shared denylist and its instances are blocked here, kept in sync every few
            hours. A subscription only ever removes the blocks it created: blocks you added by hand
            stay, and a domain on the allowlist is never blocked by a list.
          </>
        }
      />
      <AdminBlocklistSubscriptionsView />
    </main>
  );
}
