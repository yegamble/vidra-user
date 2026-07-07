"use client";

import { useRouter } from "next/navigation";

import type { FeedScope, FeedSort } from "@/lib/api";
import { feedHref, type FeedFilters } from "@/lib/feed-url";

const OPTIONS: { scope: FeedScope; label: string }[] = [
  { scope: "local", label: "Local" },
  { scope: "all", label: "All" },
];

// FeedScopeToggle is the home feed's federation-scope switcher: Local shows
// only this instance's videos (the default), All mixes in federated remote
// videos for discovery. It is a binary segmented switcher (design-system
// "Segmented switcher" pattern — a muted track with the active segment raised),
// deliberately quieter than the Recent/Popular/Trending sort *chips* so the
// primary filter row leads and this secondary control does not read as a second
// competing selection. The active scope lives in the URL (?scope=all; local
// stays implicit) so scoped views are shareable and back/forward friendly —
// clicking pushes a new URL and the server page remounts the feed. Active
// sort/filters ride along via feedHref. Toggle-button semantics (role="group"
// + aria-pressed) are unchanged.
export function FeedScopeToggle({
  active,
  sort,
  filters = {},
}: {
  active: FeedScope;
  sort: FeedSort;
  filters?: FeedFilters;
}) {
  const router = useRouter();
  return (
    <div
      role="group"
      aria-label="Feed scope"
      className="inline-flex items-center rounded-full bg-surface-muted p-1"
    >
      {OPTIONS.map(({ scope, label }) => (
        <button
          key={scope}
          type="button"
          aria-pressed={active === scope}
          onClick={() => {
            if (scope !== active) {
              router.push(
                feedHref(sort, { ...filters, scope: scope === "all" ? "all" : undefined }),
              );
            }
          }}
          className={
            active === scope
              ? "focus-ring rounded-full bg-surface px-3.5 py-1 text-[13px] font-semibold text-fg shadow-sm transition-colors"
              : "focus-ring rounded-full px-3.5 py-1 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
