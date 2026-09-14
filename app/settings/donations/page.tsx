import { DonationSettingsView } from "@/components/DonationSettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { hideSoftwareName, platformLabel } from "@/lib/software-brand";

// The non-custodial disclaimer names the software in prose, so the page reads
// the instance snapshot for the white-label decision (branding.hide_software_name)
// rather than hardcoding the product name. The CLAIM never changes — it is a
// legal statement about how donations work, not branding. The label follows an em
// dash inside the sentence ("Display only — …"), hence sentenceStart: false.
export default async function DonationSettingsPage() {
  const label = platformLabel(hideSoftwareName(await getInstanceConfig()), {
    sentenceStart: false,
  });
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Donation addresses"
        description={
          <>
            Public crypto addresses shown on your profile and channels. Display only — {label}{" "}
            never holds funds or processes payments.
          </>
        }
      />
      <DonationSettingsView />
    </main>
  );
}
