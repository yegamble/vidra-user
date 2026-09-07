import { SecuritySettingsView } from "@/components/auth/SecuritySettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";
import { getInstanceConfig } from "@/lib/instance-config.server";

export default async function SecuritySettingsPage() {
  // features.mail says whether this deployment has an outbound mail path at
  // all. The email-change card is the one control here that cannot work
  // without one, and it would otherwise park a pending change forever.
  const instance = await getInstanceConfig();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Security"
        description="Your email address, password, two-factor authentication and signed-in devices."
      />
      <SecuritySettingsView mailEnabled={instance?.features?.mail !== false} />
    </main>
  );
}
