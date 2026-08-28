import { BlockedUsersView } from "@/components/BlockedUsersView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function BlockedUsersPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Blocked accounts"
        description="Accounts you have blocked. Neither of you can send the other a direct message."
      />
      <BlockedUsersView />
    </main>
  );
}
