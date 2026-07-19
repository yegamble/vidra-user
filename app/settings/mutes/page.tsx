import { MutedAccountsView } from "@/components/MutedAccountsView";
import { MutesTabs } from "@/components/MutesTabs";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

export default function MutedAccountsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <SettingsBackLink />
      <h1 className="mb-1 text-title sm:text-large-title">Muted accounts</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Accounts you have muted. Their comments are hidden from you.
      </p>
      <MutesTabs />
      <MutedAccountsView />
    </main>
  );
}
