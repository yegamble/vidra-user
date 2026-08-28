import { ConnectionsView } from "@/components/ConnectionsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function ConnectionsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Connected accounts"
        description={
          <>
            Accounts on other networks that Vidra can post to on your behalf. Cross-posting is outbound
            only and happens automatically when you publish a public video.
          </>
        }
      />
      <ConnectionsView />
    </main>
  );
}
