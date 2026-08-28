import { GlobeIcon } from "@/components/icons";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

/**
 * How the capsule is drawn.
 *
 * `ribbon` is the `Badge` `federated` variant — the neutral capsule wearing the
 * tri-protocol ribbon on its top edge, and one of the three sanctioned ribbon
 * placements. It marks a federated *video* on the cards and search results.
 *
 * `plain` is the quieter surface-muted pill used where the ribbon would be
 * noise: next to a remote comment author, a remote actor row, and on the remote
 * watch page — all three of which already sit beside a `ProtocolBadge` spelling
 * out "ActivityPub".
 */
export type FederatedOriginVariant = "ribbon" | "plain";

/**
 * Two sizes, because the pill's padding and weight are not overridable from a
 * call site: `cn` is a plain join, not tailwind-merge, so a `className` of
 * `px-2.5` cannot beat a base `px-2`. `sm` is the inline-metadata pill (11px,
 * medium); `md` is the watch-page header pill (12px, semibold).
 */
export type FederatedOriginSize = "sm" | "md";

const PLAIN_SIZE: Record<FederatedOriginSize, string> = {
  sm: "px-2 py-0.5 text-[11px] font-medium",
  md: "px-2.5 py-0.5 text-xs font-semibold",
};

const ICON_PX: Record<FederatedOriginSize, number> = { sm: 12, md: 14 };

export interface FederatedOriginBadgeProps {
  /** The origin instance's host, e.g. `example.tube`. */
  domain: string;
  variant?: FederatedOriginVariant;
  size?: FederatedOriginSize;
  /** Native tooltip, e.g. `Federated comment from example.tube`. */
  title?: string;
  /**
   * Clip an over-long host with an ellipsis. On by default; the watch-page
   * header lets it run because its row has the width to spare.
   */
  truncate?: boolean;
  /**
   * Render the shared `ActivityPub` protocol label as a following sibling — the
   * pairing three of the four surfaces use. Emitted as a sibling, not a child,
   * so it stays a separate pill in the parent's flex row.
   */
  withProtocol?: boolean;
  /** Additive classes only (layout/stacking); see the `cn` caveat above. */
  className?: string;
}

/**
 * FederatedOriginBadge — "this came from another instance", as one component.
 *
 * The globe glyph, the `sr-only` "From " prefix that makes the bare host read
 * as a sentence, and the capsule around them were hand-inlined at five call
 * sites, each with its own verbatim copy of the nine-line globe `<svg>` even
 * though `components/icons` has exported `GlobeIcon` all along — the single
 * icon source the nav docs point at.
 */
export function FederatedOriginBadge({
  domain,
  variant = "plain",
  size = "sm",
  title,
  truncate = true,
  withProtocol = false,
  className,
}: FederatedOriginBadgeProps) {
  const glyph = <GlobeIcon size={ICON_PX[size]} strokeWidth={2} className="shrink-0" />;
  // The prefix is a screen-reader-only word, so the pill announces "From
  // example.tube" rather than a naked hostname.
  const label = (
    <>
      <span className="sr-only">From </span>
      {truncate ? <span className="truncate">{domain}</span> : domain}
    </>
  );

  const pill =
    variant === "ribbon" ? (
      <Badge variant="federated" title={title} className={cn("max-w-full text-[11px]", className)}>
        {glyph}
        {label}
      </Badge>
    ) : (
      <span
        title={title}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-full bg-surface-muted text-fg-muted",
          PLAIN_SIZE[size],
          className,
        )}
      >
        {glyph}
        {label}
      </span>
    );

  if (!withProtocol) return pill;
  return (
    <>
      {pill}
      <ProtocolBadge protocol="activitypub" />
    </>
  );
}
