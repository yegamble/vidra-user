import { ConnectionsView } from "@/components/ConnectionsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

export default function ConnectionsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SettingsBackLink />
      <h1 className="mb-1 text-title sm:text-large-title">Connected accounts</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Accounts on other networks that Vidra can post to on your behalf. Cross-posting is outbound
        only and happens automatically when you publish a public video.
      </p>
      <ConnectionsView />
    </main>
  );
}
