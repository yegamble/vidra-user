import { DonationSettingsView } from "@/components/DonationSettingsView";

export default function DonationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Donation addresses</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Public crypto addresses shown on your profile and channels. Display only — Vidra never
        holds funds or processes payments.
      </p>
      <DonationSettingsView />
    </main>
  );
}
