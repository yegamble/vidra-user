import Link from "next/link";
import { Component, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Pluggable } from "unified";

import { cn } from "@/lib/cn";
import { splitTimestamps } from "@/lib/timestamp-links";
import { exceedsParseBudget, remarkBoundTree, rehypeMentions, rehypeTimestamps } from "@/lib/user-text-plugins";

/*
 * UserText — the ONE renderer for UNTRUSTED user-authored text: video and
 * channel descriptions, account bios, comments. PeerTube stores all of these as
 * markdown (and linkifies bare URLs), so imported text arrives with literal
 * `[label](https://…)` that must render as links. (components/Markdown.tsx is
 * for TRUSTED operator documents — it allows images and has no URL allowlist —
 * and is deliberately not reused here.)
 *
 * Security stance, enforced in layers:
 *  1. react-markdown never parses raw HTML (no rehype-raw): `<script>`, `<img
 *     onerror>`, `on*` attributes are only ever text. Output is React elements;
 *     there is no dangerouslySetInnerHTML.
 *  2. `allowedElements` is an allowlist per variant (images, headings, tables,
 *     task-list inputs are never emitted); disallowed elements are unwrapped so
 *     their text survives.
 *  3. `urlTransform` + the `a` renderer are an ALLOWLIST (http:, https:,
 *     mailto:) — everything else (javascript:, data:, vbscript:, file:,
 *     protocol-relative `//host`, relative paths, entity/whitespace-obfuscated
 *     schemes, which the parser decodes before we see them) renders as plain text.
 *  4. http(s) links open in a new tab with rel="nofollow noopener noreferrer ugc".
 *  5. Parse cost is bounded: nesting depth is capped (remarkBoundTree) and a
 *     body above a size/delimiter budget skips the parser entirely (plain text
 *     with the same safe links/timestamps). That is what protects server
 *     rendering; PlainTextBoundary is a CLIENT-side net only (React does not run
 *     error boundaries during SSR).
 *
 * Timestamps: (h:)mm:ss tokens become seek links via a hast plugin (existing
 * lib/timestamp-links grammar + duration clamp); text inside links (and, for
 * descriptions, code) is skipped so an anchor never nests an anchor.
 * Mentions (comments): `@user` text becomes a link to the local profile via
 * the same kind of hast plugin (rehypeMentions); the href is built by the
 * renderer from the regex-validated name, never taken from user text, and
 * `@user@host` stays text. It runs inside the same parse budget as everything else.
 * Line breaks: `whitespace-pre-wrap` is the only mechanism (hard-break <br> is
 * not allowed, or the break would double).
 */

export type UserTextVariant = "description" | "comment";

// PeerTube parity: descriptions get emphasis, lists, links, code; comments get
// links, emphasis and lists. Headings are rendered as bold paragraphs so their
// text survives (e.g. a setext `text\n---`).
const COMMON = ["p", "a", "strong", "em", "del", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6"];
const ALLOWED: Record<UserTextVariant, string[]> = {
  description: [...COMMON, "code", "pre", "blockquote"],
  comment: COMMON,
};
// Timestamps are not linkified inside these (anchors cannot nest; code is literal).
const SKIP: Record<UserTextVariant, string[]> = {
  description: ["a", "code", "pre"],
  comment: ["a"],
};

const SAFE_URL_RE = /^(?:https?:\/\/|mailto:)/i;

/** The only hrefs user text may carry; anything else yields "" (text only). */
export function safeUserUrl(url: string | undefined | null): string {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  return SAFE_URL_RE.test(trimmed) ? trimmed : "";
}

const LINK_CLASS =
  "focus-ring rounded-sm break-words font-medium text-accent-text underline underline-offset-2";
const TS_CLASS =
  "focus-ring rounded-sm font-semibold text-accent-text underline underline-offset-2 tabular-nums";

// A match must not follow a letter or digit, so `xwww.evil.test` and
// `hhttps://e.test` are not linkified mid-word.
const BARE_URL_RE = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)[^\s<>"']+/giu;

// Drop sentence punctuation and unbalanced closers from the end of a bare URL.
function trimUrl(url: string): string {
  let end = url.length;
  const open = (url.match(/\(/g) ?? []).length;
  let close = (url.match(/\)/g) ?? []).length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,;:!?\"'".includes(ch)) end--;
    else if (ch === ")" && close > open) {
      close--;
      end--;
    } else break;
  }
  return url.slice(0, end);
}

function TimestampLink({
  seconds,
  onSeek,
  children,
}: {
  seconds: number;
  onSeek?: (seconds: number) => void;
  children: ReactNode;
}) {
  return (
    <a
      href={`?t=${seconds}`}
      data-timestamp-seconds={seconds}
      className={TS_CLASS}
      onClick={
        onSeek
          ? (event: MouseEvent<HTMLAnchorElement>) => {
              // Modified / non-primary clicks keep open-in-new-tab semantics.
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
              }
              event.preventDefault();
              onSeek(seconds);
            }
          : undefined
      }
    >
      {children}
    </a>
  );
}

function PlainText({
  text,
  className,
  linkify = false,
  durationSeconds,
  onSeek,
  timestamps = true,
}: {
  timestamps?: boolean;
  text: string;
  className?: string;
  linkify?: boolean;
  durationSeconds?: number | null;
  onSeek?: (seconds: number) => void;
}) {
  const nodes: ReactNode[] = [];
  if (linkify) {
    let last = 0;
    const pushText = (chunk: string) => {
      if (!timestamps) {
        nodes.push(chunk);
        return;
      }
      for (const seg of splitTimestamps(chunk, durationSeconds)) {
        nodes.push(
          typeof seg === "string" ? (
            seg
          ) : (
            <TimestampLink key={nodes.length} seconds={seg.seconds} onSeek={onSeek}>
              {seg.token}
            </TimestampLink>
          ),
        );
      }
    };
    for (const m of text.matchAll(BARE_URL_RE)) {
      const raw = trimUrl(m[0]);
      const href = safeUserUrl(/^www\./i.test(raw) ? `http://${raw}` : raw);
      if (!href) continue;
      pushText(text.slice(last, m.index));
      nodes.push(
        <a key={nodes.length} href={href} target="_blank" rel="nofollow noopener noreferrer ugc" className={LINK_CLASS}>
          {raw}
        </a>,
      );
      last = m.index + raw.length;
    }
    pushText(text.slice(last));
  }
  return (
    <div className={cn("min-w-0 whitespace-pre-wrap break-words", className)}>
      {linkify ? nodes : text}
    </div>
  );
}

/** Error boundary: any render failure degrades to the raw text, never the page. */
export class PlainTextBoundary extends Component<
  { text: string; className?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <PlainText text={this.props.text} className={this.props.className} />;
    return this.props.children;
  }
}

export interface UserTextProps {
  text: string;
  variant: UserTextVariant;
  className?: string;
  /** Known video duration; timestamps beyond it stay plain text. */
  durationSeconds?: number | null;
  /** false: timestamps stay plain text (surfaces with no player to seek). */
  timestamps?: boolean;
  /** Watch-page seek handler for timestamp links. */
  onSeek?: (seconds: number) => void;
  /**
   * `@user` becomes a link to /users/<user>. Defaults to on for comments only;
   * pass false where the text comes from another instance (a bare @name there
   * does not name OUR user). `@user@host` is never linked.
   */
  mentions?: boolean;
}

export function UserText({
  text,
  variant,
  className,
  durationSeconds = null,
  onSeek,
  timestamps = true,
  mentions = variant === "comment",
}: UserTextProps) {
  const heading = ({ children }: { children?: ReactNode }) => (
    <p className="whitespace-pre-wrap font-semibold">{children}</p>
  );

  const components: Components = {
    p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
    li: ({ children }) => <li className="whitespace-pre-wrap break-words">{children}</li>,
    ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="flex flex-col gap-2 border-l-2 border-border pl-3 text-fg-muted">
        {children}
      </blockquote>
    ),
    code: ({ children }) => (
      <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="overflow-x-auto rounded-xl bg-surface-muted p-3 text-[13px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    a: ({ node, href, children }) => {
      const mentioned = node?.properties?.dataMentionUsername;
      if (typeof mentioned === "string") {
        return (
          <Link href={`/users/${encodeURIComponent(mentioned)}`} className={LINK_CLASS}>
            {children}
          </Link>
        );
      }
      const seconds = node?.properties?.dataTimestampSeconds;
      if (typeof seconds === "number") {
        return (
          <TimestampLink seconds={seconds} onSeek={onSeek}>
            {children}
          </TimestampLink>
        );
      }
      const safe = safeUserUrl(href);
      if (!safe) return <span>{children}</span>;
      const mail = safe.toLowerCase().startsWith("mailto:");
      return (
        <a
          href={safe}
          target={mail ? undefined : "_blank"}
          rel="nofollow noopener noreferrer ugc"
          className={LINK_CLASS}
        >
          {children}
        </a>
      );
    },
  };

  const rehypePlugins: Pluggable[] = [];
  if (mentions) rehypePlugins.push([rehypeMentions, { skip: [...SKIP[variant], "code", "pre"] }]);
  if (timestamps) rehypePlugins.push([rehypeTimestamps, { durationSeconds, skip: SKIP[variant] }]);

  if (exceedsParseBudget(text)) {
    return <PlainText
        linkify
        text={text}
        className={className}
        durationSeconds={durationSeconds}
        timestamps={timestamps}
        onSeek={onSeek}
      />;
  }

  return (
    <PlainTextBoundary text={text} className={className}>
      <div className={cn("flex min-w-0 flex-col gap-2 break-words", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBoundTree]}
          rehypePlugins={rehypePlugins}
          allowedElements={ALLOWED[variant]}
          unwrapDisallowed
          urlTransform={safeUserUrl}
          components={components}
        >
          {text}
        </ReactMarkdown>
      </div>
    </PlainTextBoundary>
  );
}
