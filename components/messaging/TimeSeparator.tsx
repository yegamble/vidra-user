// TimeSeparator — a centered day/gap label between message clusters (iMessage
// style), replacing the old per-bubble timestamps. It is real, readable text
// (a list item, never aria-hidden) so screen readers announce the time context.
export function TimeSeparator({ label, iso }: { label: string; iso: string }) {
  return (
    <li className="my-5 flex justify-center">
      <time
        dateTime={iso}
        className="text-footnote font-semibold tabular-nums text-fg-muted"
      >
        {label}
      </time>
    </li>
  );
}

// NewMessagesDivider — a hairline marker above the first unread message on open.
export function NewMessagesDivider() {
  return (
    <li className="my-5 flex items-center gap-3" aria-label="New messages">
      <span className="h-px flex-1 bg-border-subtle" aria-hidden />
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg-muted">
        New
      </span>
      <span className="h-px flex-1 bg-border-subtle" aria-hidden />
    </li>
  );
}
