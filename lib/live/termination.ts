import type { LiveTermination, LiveTerminationReason } from "@/lib/api";

/**
 * The creator-facing copy for a live-stream termination.
 *
 * Core stores a reason CODE and, optionally, the moderator's own words. The code
 * is a closed set precisely so this file can turn it into a sentence — the audit
 * trail cannot carry prose, and a UI that rendered `policy_violation` at a
 * creator would be showing them a database value and calling it an explanation.
 *
 * One module because two surfaces need the same sentence: the public stream page
 * (where the creator lands when their broadcast stops) and the Studio list
 * (where they look afterwards). Two copies would drift, and a creator told two
 * different things about one takedown has been told nothing.
 */

/** The reason codes, in the order core lists them. */
export const TERMINATION_REASONS: readonly LiveTerminationReason[] = [
  "policy_violation",
  "copyright",
  "sensitive_content",
  "spam",
  "harassment",
  "legal_request",
  "technical",
  "other",
] as const;

/**
 * A short label for a reason code — what a moderator picks from, and the phrase
 * that completes "This stream was ended by a moderator: …".
 *
 * Written in the creator's terms rather than the policy's: "Copyright claim",
 * not "DMCA takedown request received pursuant to". The moderator's free text is
 * where the specifics go.
 */
const REASON_LABELS: Record<LiveTerminationReason, string> = {
  policy_violation: "Breaks the instance rules",
  copyright: "Copyright claim",
  sensitive_content: "Sensitive content",
  spam: "Spam",
  harassment: "Harassment",
  legal_request: "Legal request",
  technical: "Technical problem",
  other: "Other",
};

/** The label for a reason code. An unknown code (an older/newer core) falls back
 * to the code itself rather than to nothing: a creator seeing a raw token still
 * learns more than a creator seeing a blank. */
export function terminationReasonLabel(code: string | undefined): string {
  if (!code) return "";
  return REASON_LABELS[code as LiveTerminationReason] ?? code;
}

/**
 * The full sentence shown to a creator whose stream was ended.
 *
 * A moderator termination names the reason. The creator's OWN end names nobody —
 * they did it, they know — and reads as a plain statement of fact so the Studio
 * list does not accuse them of a takedown they performed themselves.
 */
export function terminationHeadline(t: LiveTermination): string {
  if (!t.by_moderator) return "You ended this stream.";
  const label = terminationReasonLabel(t.reason_code);
  return label
    ? `This stream was ended by a moderator: ${label}.`
    : "This stream was ended by a moderator.";
}
