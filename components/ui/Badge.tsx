import type { HTMLAttributes } from "react";

import { ProtocolRibbon } from "@/components/ProtocolRibbon";
import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "inverse"
  | "strong"
  | "protocol"
  | "federated";

/** The three federation protocols a `protocol` badge can carry. */
export type ProtocolColor = "activitypub" | "bluesky" | "ipfs";

const VARIANT: Record<Exclude<BadgeVariant, "protocol" | "federated">, string> = {
  neutral: "bg-surface-muted text-fg-muted",
  accent: "bg-accent text-accent-fg",
  success: "bg-success/15 text-success",
  // Danger uses the opaque danger-surface tint, not a /15 fill: Apple's
  // systemRed danger text cannot clear AA on a 15% red-on-light pink, but it
  // does on the paler danger-surface (matches the channel-sync "Failed" pill).
  danger: "bg-danger-surface text-danger",
  warning: "bg-warning/15 text-warning",
  // Role pills: ADMIN reads as an inverse chip; MOD as a quieter strong-fill chip.
  inverse: "bg-fg text-canvas",
  strong: "bg-surface-strong text-fg-muted",
};

// Protocol badges: a ~12% brand tint + a full-strength brand dot, with a neutral
// `fg` label. The teal/blue protocol hues fail AA as text, so the dot (not the
// text) carries the color; the label stays readable (`fg` on the pale tint).
// Static class strings so Tailwind sees them.
const PROTOCOL_FILL: Record<ProtocolColor, string> = {
  activitypub: "bg-protocol-activitypub/12 text-fg",
  bluesky: "bg-protocol-bluesky/12 text-fg",
  ipfs: "bg-protocol-ipfs/12 text-fg",
};
const PROTOCOL_DOT: Record<ProtocolColor, string> = {
  activitypub: "bg-protocol-activitypub",
  bluesky: "bg-protocol-bluesky",
  ipfs: "bg-protocol-ipfs",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  /**
   * The design's uppercase micro-status style (PUBLISHED / PROCESSING / IN REVIEW
   * / DRAFT / FAILED, and the ADMIN / MOD role pills): 10.5px, bold, uppercase,
   * letter-spaced. Default false keeps the softer sentence-case pill.
   */
  status?: boolean;
  /**
   * Which protocol the `protocol` variant renders (its tint + dot). Ignored by
   * other variants. Defaults to ActivityPub.
   */
  protocol?: ProtocolColor;
};

/**
 * Badge — a small status pill (privacy, state, counts, "Verified"/"Unverified",
 * live/offline, role, protocol/federation, …). Purely presentational; when it
 * conveys state that isn't in adjacent text, give it an accessible label at the
 * call site.
 *
 * The `protocol` variant tints the capsule with a federation brand color (dot +
 * neutral label). The `federated` variant marks a remote/federated origin: a
 * neutral capsule wearing the tri-protocol ribbon on its top edge (the third
 * and final sanctioned ribbon placement).
 */
export function Badge({
  variant = "neutral",
  status = false,
  protocol = "activitypub",
  className,
  children,
  ...props
}: BadgeProps) {
  const base = cn(
    "inline-flex items-center gap-1 rounded-full",
    status
      ? "px-2 py-[2.5px] text-[10.5px] font-bold uppercase tracking-[0.04em]"
      : "px-2 py-0.5 text-xs font-medium",
  );

  if (variant === "protocol") {
    return (
      <span className={cn(base, PROTOCOL_FILL[protocol], className)} {...props}>
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PROTOCOL_DOT[protocol])} />
        {children}
      </span>
    );
  }

  if (variant === "federated") {
    return (
      <span
        className={cn(base, "relative overflow-hidden bg-surface-muted pt-[3px] text-fg-muted", className)}
        {...props}
      >
        <ProtocolRibbon className="absolute inset-x-0 top-0 rounded-none" />
        {children}
      </span>
    );
  }

  return (
    <span className={cn(base, VARIANT[variant], className)} {...props}>
      {children}
    </span>
  );
}
