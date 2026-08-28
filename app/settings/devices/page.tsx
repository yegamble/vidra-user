import { DevicesView } from "@/components/e2ee/DevicesView";
import { PageHeader } from "@/components/PageHeader";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

export default function DevicesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Encrypted-messaging devices"
        description={
          <>
            Each device you use encrypted messaging on has its own keys. Compare a device&rsquo;s
            safety number with the other person out of band to verify no one is intercepting.
          </>
        }
      />
      <DevicesView />
    </main>
  );
}
