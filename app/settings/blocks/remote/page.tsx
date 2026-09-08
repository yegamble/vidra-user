import { BlockedRemoteAccountsView } from "@/components/BlockedRemoteAccountsView";
import { BlocksTabs } from "@/components/BlocksTabs";
import { PageHeader } from "@/components/PageHeader";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

// Blocked REMOTE accounts (A29-F7). A sibling page rather than a second list on
// /settings/blocks: the identity is a federated actor URL, it is added by
// pasting a handle rather than picked from a local account, and it does a
// narrower thing — it cannot cut off direct messages, because there are none
// across the federation boundary.
export default function BlockedRemoteAccountsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Blocked remote accounts"
        description="Federated accounts you have blocked. Their videos are hidden from you, their replies stay off your videos, and their follows of your channels are refused — without blocking everyone else on their instance."
      />
      <BlocksTabs />
      <BlockedRemoteAccountsView />
    </main>
  );
}
