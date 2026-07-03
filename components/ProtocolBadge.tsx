// ProtocolBadge is the shared federation-protocol label (fix_plan P11): a small
// pill naming how a piece of content travels — "ActivityPub" on federated
// surfaces (remote cards, the remote watch page, remote-authored comments),
// "ATProto" where content is cross-posted to Bluesky / the ATProto network, or
// "Local only" for content/instances that do not federate. Purely visual; the
// title carries the long-form explanation for sighted users and the visible
// text is the accessible name.
//
// The ATProto variant labels OUTBOUND Bluesky cross-posting (P11 extension,
// announce-only) — used on the Bluesky connection settings surface where the
// user opts their published videos into the ATProto network. Vidra does not yet
// INGEST ATProto content, so remote content surfaces stay ActivityPub.
export type Protocol = "activitypub" | "atproto" | "local";

const LABEL: Record<Protocol, string> = {
  activitypub: "ActivityPub",
  atproto: "ATProto",
  local: "Local only",
};

const TITLE: Record<Protocol, string> = {
  activitypub: "Federated content, exchanged via the ActivityPub protocol",
  atproto: "Cross-posted to the Bluesky network via the ATProto protocol",
  local: "Local-only content — not federated to other instances",
};

const TONE: Record<Protocol, string> = {
  activitypub: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  atproto: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  local: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

function Glyph({ protocol }: { protocol: Protocol }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-3 w-3 shrink-0",
  };
  if (protocol === "activitypub") {
    // Share-nodes glyph: three linked dots (federation).
    return (
      <svg {...common}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
    );
  }
  if (protocol === "atproto") {
    // Broadcast/announce glyph: a source radiating outward (cross-posting).
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
      </svg>
    );
  }
  // Home glyph: stays on this instance.
  return (
    <svg {...common}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

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
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[protocol]} ${className}`}
    >
      <Glyph protocol={protocol} />
      {LABEL[protocol]}
    </span>
  );
}
