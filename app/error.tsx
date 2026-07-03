"use client";

import { useEffect } from "react";

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
        className="flex w-full flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-16 text-center dark:border-red-900/50 dark:bg-red-950/30"
      >
        <h1 className="text-lg font-medium text-red-700 dark:text-red-300">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-red-600 dark:text-red-400">
          An unexpected error occurred while showing this page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
