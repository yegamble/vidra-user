import { t } from "@/lib/i18n";

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const heading = title ?? t("state.errorTitle");
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-16 text-center dark:border-red-900/50 dark:bg-red-950/30"
    >
      <p className="text-lg font-medium text-red-700 dark:text-red-300">{heading}</p>
      {message ? <p className="max-w-sm text-sm text-red-600 dark:text-red-400">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
        >
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}
