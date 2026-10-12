import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";
import { linkifyTimestamps } from "@/lib/timestamp-links";

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
 *  4. Links open in a new tab with rel="nofollow noopener noreferrer ugc".
 *
 * Timestamps: (h:)mm:ss tokens in text runs still become seek links (existing
 * lib/timestamp-links grammar + duration clamp); link labels are left alone so
 * an anchor never nests an anchor.
 */

export type UserTextVariant = "description" | "comment";

// PeerTube parity: descriptions get emphasis, lists, links, line breaks, code;
// comments get links, emphasis and line breaks only.
const ALLOWED: Record<UserTextVariant, string[]> = {
  description: ["p", "br", "a", "strong", "em", "del", "ul", "ol", "li", "code", "pre", "blockquote"],
  comment: ["p", "br", "a", "strong", "em", "del"],
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

export interface UserTextProps {
  text: string;
  variant: UserTextVariant;
  className?: string;
  /** Known video duration; timestamps beyond it stay plain text. */
  durationSeconds?: number | null;
  /** Watch-page seek handler for timestamp links. */
  onSeek?: (seconds: number) => void;
  keyPrefix?: string;
}

export function UserText({
  text,
  variant,
  className,
  durationSeconds = null,
  onSeek,
  keyPrefix = "ut",
}: UserTextProps) {
  // Linkify timestamps in direct string children only (never inside <a>).
  const stamp = (children: ReactNode): ReactNode =>
    Children.map(children, (child, i) =>
      typeof child === "string"
        ? linkifyTimestamps(child, { durationSeconds, onSeek, keyPrefix: `${keyPrefix}-${i}` })
        : child,
    );

  const components: Components = {
    p: ({ children }) => <p className="whitespace-pre-wrap break-words">{stamp(children)}</p>,
    strong: ({ children }) => <strong className="font-semibold">{stamp(children)}</strong>,
    em: ({ children }) => <em>{stamp(children)}</em>,
    del: ({ children }) => <del>{stamp(children)}</del>,
    li: ({ children }) => <li className="whitespace-pre-wrap break-words">{stamp(children)}</li>,
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
    a: ({ href, children }) => {
      const safe = safeUserUrl(href);
      if (!safe) return <span>{children}</span>;
      return (
        <a
          href={safe}
          target="_blank"
          rel="nofollow noopener noreferrer ugc"
          className={LINK_CLASS}
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2 break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={ALLOWED[variant]}
        unwrapDisallowed
        urlTransform={safeUserUrl}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
