import { LibraryView } from "@/components/LibraryView";
import { PageShell } from "@/components/PageShell";

// The Library page is the design's Library hub (Vidra App template): a History
// rail, a Playlists list, and a Saved list. It is also the sole entry point to
// the /playlists route (the desktop sidebar no longer carries Playlists — a
// "Playlists" link lives in LibraryView). The page joins the shared wide canvas
// while its row-based content keeps a readable, left-aligned inner measure.
export default function LibraryPage() {
  return (
    <PageShell className="py-6 sm:py-8">
      <div className="w-full max-w-5xl">
        <h1 className="mb-6 text-[26px] font-bold tracking-[-0.04em] sm:text-2xl sm:tracking-tight">
          Library
        </h1>
        <LibraryView />
      </div>
    </PageShell>
  );
}
