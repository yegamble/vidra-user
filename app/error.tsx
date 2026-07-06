"use client";

import { useEffect } from "react";

import { t } from "@/lib/i18n";
import { logger } from "@/lib/logger";

// Route-level error boundary: the last line of defence for render/runtime
// errors below the root layout. Per-view fetch errors are still handled inline
// by each view (ErrorState with retry); this only catches what they don't.
// `reset` re-renders the failed segment.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("route error boundary caught", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24">
      <div
        role="alert"
        className="flex w-full flex-col items-center gap-3 rounded-2xl border border-danger-border bg-danger-surface px-6 py-16 text-center"
      >
        <h1 className="text-lg font-semibold tracking-tight text-danger">
          {t("state.errorTitle")}
        </h1>
        <p className="max-w-sm text-sm text-danger">{t("state.errorBody")}</p>
        <button
          type="button"
          onClick={reset}
          className="focus-ring rounded-full border border-danger-border px-4 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
        >
          {t("common.retry")}
        </button>
      </div>
    </main>
  );
}
