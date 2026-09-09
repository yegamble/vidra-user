import { SecuritySettingsView } from "@/components/auth/SecuritySettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";
import { getInstanceConfig } from "@/lib/instance-config.server";

export default async function SecuritySettingsPage({
  searchParams,
}: {
  // The step-up callback lands here with ?step_up=<token> (or
  // ?step_up_error=<code>) and the ?secure= action that asked for it. Read
  // server-side and handed down as props, the way the login page reads
  // ?oauth_error — a client component scraping window.location in an effect
  // would be a hydration mismatch and a synchronous setState in an effect.
  searchParams: Promise<{ step_up?: string; step_up_error?: string; secure?: string }>;
}) {
  // features.mail says whether this deployment has an outbound mail path at
  // all. The email-change card is the one control here that cannot work
  // without one, and it would otherwise park a pending change forever.
  const [instance, sp] = await Promise.all([getInstanceConfig(), searchParams]);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Security"
        description="Your email address, password, two-factor authentication and signed-in devices."
      />
      <SecuritySettingsView
        mailEnabled={instance?.features?.mail !== false}
        stepUp={sp.step_up ?? ""}
        stepUpError={sp.step_up_error ?? ""}
        secure={sp.secure ?? ""}
      />
    </main>
  );
}
