import type { ReactNode } from "react";

// VideoGrid is the single source of truth for the browse-feed grid geometry —
// the "home vocabulary" (specs/design/{app,desktop}-template): 1-up on phones,
// 2-up at sm, 3-up at lg, with the generous gap-x-5 / gap-y-8 rhythm and no card
// borders (the cards sit directly on the page canvas). Every video-card surface
// — home + trending feed, channel page, subscriptions, library, history —
// renders its <li> items through this wrapper so the grid never forks per page.
//
// Callers pass their own <li> children (history, for one, adds a per-item
// resume/remove footer under each card), keeping the geometry centralized while
// leaving per-surface item content free. Pass `ariaLabel` when the list needs a
// name in the a11y tree; otherwise the surrounding page heading carries context.
export function VideoGrid({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <ul
      aria-label={ariaLabel}
      className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3"
    >
      {children}
    </ul>
  );
}
