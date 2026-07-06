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
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-danger-border bg-danger-surface px-6 py-16 text-center"
    >
      <p className="text-lg font-semibold tracking-tight text-danger">{heading}</p>
      {message ? <p className="max-w-sm text-sm text-danger">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring rounded-full border border-danger-border px-4 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
        >
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}
