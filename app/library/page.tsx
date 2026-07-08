import { LibraryView } from "@/components/LibraryView";

// The Library page is the design's Library hub (Vidra App template): a History
// rail, a Playlists list, and a Saved list. It is also the sole entry point to
// the /playlists route (the desktop sidebar no longer carries Playlists — a
// "Playlists" link lives in LibraryView). max-w-3xl keeps the row lists at a
// comfortable reading measure while the History rail scrolls horizontally.
export default function LibraryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <h1 className="mb-6 text-[26px] font-bold tracking-[-0.04em] sm:text-2xl sm:tracking-tight">
        Library
      </h1>
      <LibraryView />
    </main>
  );
}
