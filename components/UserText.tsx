import { Component, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";
import { isPathologicalMarkdown, remarkBoundTree, rehypeTimestamps } from "@/lib/user-text-plugins";

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
 *  5. Nesting depth is bounded (remarkBoundTree) and an error boundary falls
 *     back to plain text, so a hostile body can never take the page down.
 *
 * Timestamps: (h:)mm:ss tokens become seek links via a hast plugin (existing
 * lib/timestamp-links grammar + duration clamp); text inside links (and, for
 * descriptions, code) is skipped so an anchor never nests an anchor.
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

function PlainText({ text, className }: { text: string; className?: string }) {
  return <div className={cn("min-w-0 whitespace-pre-wrap break-words", className)}>{text}</div>;
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
  /** Watch-page seek handler for timestamp links. */
  onSeek?: (seconds: number) => void;
}

export function UserText({ text, variant, className, durationSeconds = null, onSeek }: UserTextProps) {
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
      const seconds = node?.properties?.dataTimestampSeconds;
      if (typeof seconds === "number") {
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

  if (isPathologicalMarkdown(text)) return <PlainText text={text} className={className} />;

  return (
    <PlainTextBoundary text={text} className={className}>
      <div className={cn("flex min-w-0 flex-col gap-2 break-words", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBoundTree]}
          rehypePlugins={[[rehypeTimestamps, { durationSeconds, skip: SKIP[variant] }]]}
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
