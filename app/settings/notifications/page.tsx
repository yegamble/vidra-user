import { NotificationPrefsView } from "@/components/NotificationPrefsView";

export default function NotificationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Notification preferences</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Choose which notifications you receive. Changes apply to new notifications immediately.
      </p>
      <NotificationPrefsView />
    </main>
  );
}
