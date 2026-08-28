import { MutedAccountsView } from "@/components/MutedAccountsView";
import { MutesTabs } from "@/components/MutesTabs";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function MutedAccountsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Muted accounts"
        description="Accounts you have muted. Their comments are hidden from you."
      />
      <MutesTabs />
      <MutedAccountsView />
    </main>
  );
}
