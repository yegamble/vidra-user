import type { Metadata } from "next";
import Link from "next/link";

import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Page not found — Vidra",
};

// Catch-all 404. Renders inside the root layout, so the site chrome (header,
// search, navigation) stays available; known-entity misses (bad video/channel
// ids) keep their richer inline not-found states in the views themselves.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{t("state.notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {t("state.notFoundBody")}
      </p>
      <Link
        href="/"
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {t("state.notFoundHome")}
      </Link>
    </main>
  );
}
