import { Markdown } from "@/components/Markdown";
import { LinkButton } from "@/components/ui/LinkButton";

// HomepageDocument — the public rendering of the admin-authored homepage
// (config-parity W6: the 'home' landing branch app/page.tsx reserved in W5).
// The document is operator markdown through the app's ONE sanitized renderer
// (components/Markdown.tsx — raw HTML never becomes elements), laid out like
// the other long-form document pages (About) inside the design system's
// reading measure. The video feed stays one tap away: the nav's browse
// destinations all carry explicit feed params (which win over the landing
// choice), and the page closes with its own explicit "Browse videos" path so
// the feed is never stranded behind the document.
export function HomepageDocument({ body }: { body: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <article aria-label="Instance homepage" className="flex flex-col gap-4">
        <Markdown>{body}</Markdown>
      </article>
      <div className="mt-10 border-t border-border-subtle pt-6">
        <LinkButton href="/?sort=recent" variant="tonal" size="sm">
          Browse videos
        </LinkButton>
      </div>
    </main>
  );
}
