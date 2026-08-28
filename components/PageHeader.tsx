import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * PageHeader is the title block every admin, settings and moderation route
 * opens with: an optional lead-in (the mobile section switcher, the settings
 * back link), the page's h1, and a line of muted prose under it.
 *
 * It exists because those thirty-odd routes had each written the block out by
 * hand and it had drifted into three shapes — the admin pages on a raw
 * `text-2xl font-bold tracking-tight` h1 while settings and moderation used the
 * `text-title sm:text-large-title` type token; moderation's description two
 * steps larger than everyone else's; three different gaps below. One component
 * means the next page inherits the settled answer instead of whichever
 * neighbour got copied.
 *
 * It deliberately renders NO <main>: every route owns its own, and e2e asserts
 * exactly one per page. `<header>` inside <main> carries no landmark role, so
 * this adds no second banner either.
 */
export function PageHeader({
  title,
  description,
  above,
  className,
}: {
  /** The page's h1. Routes are addressed by this text in e2e — keep it stable. */
  title: ReactNode;
  /** One line of muted prose under the title. Omitted when the title says enough. */
  description?: ReactNode;
  /** Rendered above the title: the admin section switcher, the settings back link. */
  above?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6", className)}>
      {above}
      <h1 className="text-title sm:text-large-title">{title}</h1>
      {description ? <p className="mt-1 text-[13px] text-fg-muted">{description}</p> : null}
    </header>
  );
}
