import { createElement, type ReactNode } from "react";

// Timestamp linkification (Wave F). A pure tokenizer that splits a plain-text
// string into a flat array of text runs and <a> nodes for the (h:)mm:ss
// timestamps inside it. It is deliberately React-node-level (never HTML string
// building), so it drops straight into the sanitized text renderers (comment
// bodies, the watch-page description) with no dangerouslySetInnerHTML anywhere.
//
// Grammar (both seconds — and, for the hour form, minutes — are strict two-digit
// 00–59; the leading field is 1–2 digits):
//   mm:ss      →  0:05, 12:34, 99:59
//   h:mm:ss    →  1:02:03, 12:00:00
// The lookbehind/lookahead reject embedding inside a longer digit/colon run, so
// "1234:56" and "1:02:03:04" never partial-match, and "9:5" / "61:99" are not
// timestamps at all (single-digit / out-of-range seconds).
const TIMESTAMP_RE = /(?<![\d:])(?:\d{1,2}:[0-5]\d:[0-5]\d|\d{1,2}:[0-5]\d)(?![\d:])/g;

// Link styling: an accent-colored, underlined inline link with the standard
// focus ring; tabular-nums keeps the digits from shifting on hover.
const LINK_CLASS =
  "focus-ring rounded-sm font-semibold text-accent-text underline underline-offset-2 tabular-nums";

export interface TimestampLinkOptions {
  /**
   * The video's known duration in seconds. When a positive, finite duration is
   * supplied, tokens that resolve BEYOND it are left as plain text (a syntactic
   * timestamp that cannot exist in this video is treated as a false positive,
   * not a broken seek) — this is the "clamp to duration" guard. Unknown/absent
   * (null/undefined/≤0) → every syntactically valid timestamp linkifies.
   */
  durationSeconds?: number | null;
  /**
   * Watch-page seek handler. When provided, an unmodified left-click seeks the
   * player in place (preventing navigation); modified clicks and the href still
   * open `?t=` in a new tab. Absent (comments/descriptions rendered OUTSIDE a
   * watch context) → the tokens are plain `?t=` links, no seek.
   */
  onSeek?: (seconds: number) => void;
  /** Key prefix so several tokenized blocks on one page keep unique React keys. */
  keyPrefix?: string;
}

// Anchored forms of the grammar (no lookarounds) so parseTimestampToken is a
// self-contained strict validator: the trailing fields must be exactly two
// digits 00–59, which is what rejects "9:5" and "61:99" on their own.
const HMS_RE = /^\d{1,2}:[0-5]\d:[0-5]\d$/;
const MS_RE = /^\d{1,2}:[0-5]\d$/;

/**
 * Parse a single (h:)mm:ss token to whole seconds, or null when the token is not
 * a well-formed timestamp (single-digit seconds, out-of-range field, extra
 * colons, non-numeric). Independent of TIMESTAMP_RE so it validates in isolation.
 */
export function parseTimestampToken(token: string): number | null {
  if (HMS_RE.test(token)) {
    const [h, m, s] = token.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  }
  if (MS_RE.test(token)) {
    const [m, s] = token.split(":").map(Number);
    return m * 60 + s;
  }
  return null;
}

function isKnownDuration(duration: number | null | undefined): duration is number {
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0;
}

/**
 * Split `text` into a flat ReactNode[] where every (h:)mm:ss timestamp becomes an
 * anchor (seek + `?t=` href) and everything else stays a plain string. Safe to
 * render directly as the children of a sanitized text element.
 */
export function linkifyTimestamps(
  text: string,
  options: TimestampLinkOptions = {},
): ReactNode[] {
  if (typeof text !== "string" || text === "") return [text ?? ""];

  const { durationSeconds, onSeek, keyPrefix = "ts" } = options;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let count = 0;

  TIMESTAMP_RE.lastIndex = 0;
  for (let match = TIMESTAMP_RE.exec(text); match !== null; match = TIMESTAMP_RE.exec(text)) {
    const token = match[0];
    const seconds = parseTimestampToken(token);
    // Bound to a known duration: an out-of-range token is left as plain text.
    if (seconds === null || (isKnownDuration(durationSeconds) && seconds > durationSeconds)) {
      continue;
    }

    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    nodes.push(
      createElement(
        "a",
        {
          key: `${keyPrefix}-${count}`,
          href: `?t=${seconds}`,
          className: LINK_CLASS,
          "data-timestamp-seconds": seconds,
          onClick: onSeek
            ? (event: import("react").MouseEvent<HTMLAnchorElement>) => {
                // Leave modified / non-primary clicks to the browser so the href
                // opens `?t=` in a new tab (open-in-new-tab semantics).
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onSeek(seconds);
              }
            : undefined,
        },
        token,
      ),
    );

    lastIndex = match.index + token.length;
    count += 1;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  // No timestamps matched → hand back the original text unchanged (one run).
  return nodes.length > 0 ? nodes : [text];
}
