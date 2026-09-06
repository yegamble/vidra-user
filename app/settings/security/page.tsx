import { SecuritySettingsView } from "@/components/auth/SecuritySettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Security"
        description="Your email address, password, two-factor authentication and signed-in devices."
      />
      <SecuritySettingsView />
    </main>
  );
}
