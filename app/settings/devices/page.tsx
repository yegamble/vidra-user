import { DevicesView } from "@/components/e2ee/DevicesView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

export default function DevicesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SettingsBackLink />
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-title sm:text-large-title">Encrypted-messaging devices</h1>
        <p className="text-[13px] text-fg-muted">
          Each device you use encrypted messaging on has its own keys. Compare a device&rsquo;s
          safety number with the other person out of band to verify no one is intercepting.
        </p>
      </div>
      <DevicesView />
    </main>
  );
}
