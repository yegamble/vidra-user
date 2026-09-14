import { ConnectionsView } from "@/components/ConnectionsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { hideSoftwareName, platformLabel } from "@/lib/software-brand";

// "Accounts on other networks that <subject> can post to on your behalf": the
// subject is the software, which a white-labelled instance may not name
// (branding.hide_software_name). It sits mid-sentence, hence sentenceStart: false.
export default async function ConnectionsPage() {
  const label = platformLabel(hideSoftwareName(await getInstanceConfig()), {
    sentenceStart: false,
  });
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Connected accounts"
        description={
          <>
            Accounts on other networks that {label} can post to on your behalf. Cross-posting is
            outbound only and happens automatically when you publish a public video.
          </>
        }
      />
      <ConnectionsView />
    </main>
  );
}
