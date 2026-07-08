import { PlayerSettingsView } from "@/components/PlayerSettingsView";

export default function PlaybackSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Playback</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Your default player preferences. Changes apply to videos you open next.
      </p>
      <PlayerSettingsView />
    </main>
  );
}
