import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";

/*
 * Markdown — the app's ONE markdown renderer (instance descriptions, terms,
 * code of conduct, the /about page and its admin previews; spec:
 * .ralph/specs/instance-platform-info.md).
 *
 * Security stance: react-markdown does NOT parse raw HTML by default and we
 * deliberately do NOT add rehype-raw — operator-authored `<script>`/`<img
 * onerror>`/arbitrary tags are never turned into elements, only markdown syntax
 * renders. Links open in a new tab with rel="noopener noreferrer".
 *
 * Typography is token-driven (design-system.md): semantic tokens only, no
 * `dark:` variants, no hex. GFM (tables, strikethrough, autolinks, task lists)
 * is enabled via remark-gfm; tables scroll inside their own container so long
 * content never breaks the page layout.
 */

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mt-2 text-xl font-bold tracking-tight text-fg first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-2 text-lg font-bold tracking-tight text-fg first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-1 text-[15px] font-bold tracking-tight text-fg first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="text-sm font-bold text-fg">{children}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-semibold text-fg">{children}</h5>,
  h6: ({ children }) => <h6 className="text-[13px] font-semibold text-fg">{children}</h6>,
  p: ({ children }) => <p className="text-sm leading-relaxed text-fg">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2 break-words"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-fg">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm leading-relaxed text-fg">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-2 border-l-2 border-border pl-3 text-fg-muted">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em] text-fg">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl bg-surface-muted p-3 text-[13px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-border-subtle" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-1.5 text-left font-semibold text-fg">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border-subtle px-3 py-1.5 text-fg">{children}</td>
  ),
  img: ({ src, alt }) => (
    // Markdown-authored images (never raw <img> HTML — that stays unparsed).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" className="max-w-full rounded-xl" />
  ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
