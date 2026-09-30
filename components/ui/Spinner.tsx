import { t } from "@/lib/i18n";

export function Spinner({ label, variant = "default" }: { label?: string; variant?: "default" | "media" }) {
  const text = label ?? t("common.loading");
  return (
    <span role="status" aria-label={text} className="inline-flex items-center">
      <svg
        className={variant === "media" ? "h-12 w-12 animate-spin text-white" : "h-6 w-6 animate-spin text-fg-muted"}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        {variant === "media" ? (
          <circle className="player-loading-arc" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        ) : <>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </>}
      </svg>
      <span className="sr-only">{text}…</span>
    </span>
  );
}
