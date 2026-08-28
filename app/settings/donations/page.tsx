import { DonationSettingsView } from "@/components/DonationSettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function DonationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Donation addresses"
        description={
          <>
            Public crypto addresses shown on your profile and channels. Display only — Vidra never
            holds funds or processes payments.
          </>
        }
      />
      <DonationSettingsView />
    </main>
  );
}
