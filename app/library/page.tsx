import Link from "next/link";

import { SavedVideosView } from "@/components/SavedVideosView";

export default function LibraryPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      {/* Library is the home for saved videos and the entry point to Playlists:
          the desktop sidebar (backport W0.2) no longer carries a Playlists link,
          so this keeps the /playlists route reachable through the UI. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <Link
          href="/playlists"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          Playlists
        </Link>
      </div>
      <SavedVideosView />
    </main>
  );
}
