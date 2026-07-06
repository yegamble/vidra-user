import { SecuritySettingsView } from "@/components/auth/SecuritySettingsView";

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Security</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Two-factor authentication for your account.
      </p>
      <SecuritySettingsView />
    </main>
  );
}
