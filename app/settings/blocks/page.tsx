import { BlockedUsersView } from "@/components/BlockedUsersView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

export default function BlockedUsersPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <SettingsBackLink />
      <h1 className="mb-1 text-title sm:text-large-title">Blocked accounts</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Accounts you have blocked. Neither of you can send the other a direct message.
      </p>
      <BlockedUsersView />
    </main>
  );
}
