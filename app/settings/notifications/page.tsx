import { NotificationPrefsView } from "@/components/NotificationPrefsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function NotificationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Notification preferences"
        description="Choose which notifications you receive. Changes apply to new notifications immediately."
      />
      <NotificationPrefsView />
    </main>
  );
}
