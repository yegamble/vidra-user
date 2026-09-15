import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import type { RemoteCommentDeliveryState } from "@/lib/api";

// RemoteCommentDeliveryBadge shows the federation status of a locally-authored
// comment on a remote video. The comment is HOSTED and shown on this instance
// regardless of this value — the badge reports only whether the Create/Update/
// Delete{Note} reached the origin's inbox:
//
//   pending   — queued, not yet accepted by the origin (the first state)
//   delivered — the origin's inbox answered 2xx
//   failed    — dead-lettered or cancelled (e.g. the destination is blocked);
//               the reason rides in `last_error`.
//
// The visible word carries the meaning (so it needs no extra label), and the
// title spells out what the state means for a mouse/AT reader. On `failed` the
// origin error is surfaced — as the title here and, at the call site, as a
// visible line — so the author knows the comment lives here but did not reach
// the origin.

const STATE: Record<
  RemoteCommentDeliveryState,
  { label: string; variant: BadgeVariant; title: string }
> = {
  pending: {
    label: "Pending",
    variant: "warning",
    title: "Waiting in the delivery queue — not yet sent to the origin instance.",
  },
  delivered: {
    label: "Delivered",
    variant: "success",
    title: "Delivered to the origin instance.",
  },
  failed: {
    label: "Failed",
    variant: "danger",
    title: "Delivery to the origin instance failed. The comment is still hosted and shown here.",
  },
};

export function RemoteCommentDeliveryBadge({
  state,
  lastError,
  className,
}: {
  state: RemoteCommentDeliveryState;
  /** The origin delivery error; shown in the title on `failed`. */
  lastError?: string | null;
  className?: string;
}) {
  const spec = STATE[state];
  // On failure prefer the concrete origin error over the generic explanation.
  const title = state === "failed" && lastError ? lastError : spec.title;
  return (
    <Badge
      variant={spec.variant}
      status
      className={className}
      title={title}
      // The badge conveys state that isn't in adjacent copy — name it for AT.
      role="status"
      aria-label={`Delivery to origin: ${spec.label}`}
    >
      {spec.label}
    </Badge>
  );
}
