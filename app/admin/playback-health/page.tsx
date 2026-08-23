import { AdminPlaybackHealthView } from "@/components/AdminPlaybackHealthView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminPlaybackHealthPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Playback health</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        What playback actually felt like: time to first frame and rebuffering,
        grouped by the delivery source that served the bytes.
      </p>
      <AdminPlaybackHealthView />
    </main>
  );
}
