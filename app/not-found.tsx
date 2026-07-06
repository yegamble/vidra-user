import type { Metadata } from "next";

import { LinkButton } from "@/components/ui";
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
      <p className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-fg-muted">404</p>
      <h1 className="text-2xl font-bold tracking-tight">{t("state.notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-fg-muted">{t("state.notFoundBody")}</p>
      <LinkButton href="/" variant="secondary" size="sm">
        {t("state.notFoundHome")}
      </LinkButton>
    </main>
  );
}
