import Link from "next/link";

import { StudioView } from "@/components/StudioView";

export default function StudioPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-x-clip px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <Link
          href="/studio/stats"
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Creator stats
        </Link>
      </div>
      <StudioView />
    </main>
  );
}
