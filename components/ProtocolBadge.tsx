// ProtocolBadge is the shared federation-protocol label (fix_plan P11): a small
// pill naming how a piece of content travels — "ActivityPub" on federated
// surfaces (remote cards, the remote watch page, remote-authored comments) or
// "Local only" for content/instances that do not federate. Purely visual; the
// title carries the long-form explanation for sighted users and the visible
// text is the accessible name. An "ATProto" variant is deferred until the
// backend exposes ATProto federation (vidra-extensions ledger).
export type Protocol = "activitypub" | "local";

const LABEL: Record<Protocol, string> = {
  activitypub: "ActivityPub",
  local: "Local only",
};

const TITLE: Record<Protocol, string> = {
  activitypub: "Federated content, exchanged via the ActivityPub protocol",
  local: "Local-only content — not federated to other instances",
};

export function ProtocolBadge({
  protocol,
  className = "",
}: {
  protocol: Protocol;
  className?: string;
}) {
  return (
    <span
      title={TITLE[protocol]}
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        protocol === "activitypub"
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      } ${className}`}
    >
      {protocol === "activitypub" ? (
        // Share-nodes glyph: three linked dots (federation).
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      ) : (
        // Home glyph: stays on this instance.
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
      )}
      {LABEL[protocol]}
    </span>
  );
}
