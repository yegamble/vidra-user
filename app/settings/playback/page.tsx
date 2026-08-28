import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PlayerSettingsView } from "@/components/PlayerSettingsView";
import { PageHeader } from "@/components/PageHeader";

export default function PlaybackSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Playback"
        description="Your default player preferences. Changes apply to videos you open next."
      />
      <PlayerSettingsView />
    </main>
  );
}
