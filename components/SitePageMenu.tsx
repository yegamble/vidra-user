import Link from "next/link";
import type { components } from "@/lib/api/generated";

type Entry = Pick<components["schemas"]["SitePageSummary"], "slug" | "title" | "menu_label">;

export function SitePageMenu({ pages }: { pages: Entry[] }) {
  if (!pages.length) return null;
  const linkStyle = "focus-ring inline-flex min-h-11 items-center break-words rounded-sm text-sm text-fg-muted hover:text-fg hover:underline";
  return (
    <nav aria-label="Site information" className="mx-4 mt-6 flex flex-wrap items-center gap-x-5 border-t border-border-subtle py-2 sm:mx-6 lg:mx-8">
      <Link href="/about/instance/moderation" className={linkStyle}>Code of Conduct</Link>
      {pages.map(page => (
        <Link key={page.slug} href={`/p/${page.slug}`} className={linkStyle}>
          {page.menu_label || page.title}
        </Link>
      ))}
    </nav>
  );
}
