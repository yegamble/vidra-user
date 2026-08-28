import { AdminPlaybackHealthView } from "@/components/AdminPlaybackHealthView";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/PageHeader";

export default function AdminPlaybackHealthPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <PageHeader
        above={<AdminTabs />}
        title="Playback health"
        description={
          <>
            What playback actually felt like: time to first frame and rebuffering,
            grouped by the delivery source that served the bytes.
          </>
        }
      />
      <AdminPlaybackHealthView />
    </main>
  );
}
