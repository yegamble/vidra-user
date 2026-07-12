"use client";

import { useRouter } from "next/navigation";

import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import type { FeedScope, FeedSort } from "@/lib/api";
import { feedHref, type FeedFilters, type FeedUrlDefaults } from "@/lib/feed-url";

const OPTIONS: readonly SegmentedOption<FeedScope>[] = [
  { value: "local", label: "Local" },
  { value: "all", label: "All" },
];

// FeedScopeToggle is the home feed's federation-scope switcher: Local shows only
// this instance's videos (the default), All mixes in federated remote videos for
// discovery. It rides on the shared rounded-rect SegmentedControl (design
// "Segmented switcher"), deliberately quieter than the Recent/Popular/Trending
// sort *chips* so the primary filter row leads. The active scope lives in the URL
// (?scope=all; local stays implicit) so scoped views are shareable and
// back/forward friendly — selecting pushes a new URL and the server page remounts
// the feed. Group semantics (role="group" name "Feed scope" + aria-pressed
// buttons) come from the primitive.
//
// A pick is always passed through EXPLICITLY (both values): feedHref keeps it
// in the URL exactly when it differs from the instance's effective default
// scope (config-parity W5) — so "Local" still wins on an instance whose
// operator default is "all", while the shipped local default keeps today's
// pretty scope-less URLs.
export function FeedScopeToggle({
  active,
  sort,
  filters = {},
  urlDefaults,
}: {
  active: FeedScope;
  sort: FeedSort;
  filters?: FeedFilters;
  /** The instance's effective feed defaults — the URL baseline (see above). */
  urlDefaults?: FeedUrlDefaults;
}) {
  const router = useRouter();
  return (
    <SegmentedControl
      options={OPTIONS}
      value={active}
      onChange={(scope) => router.push(feedHref(sort, { ...filters, scope }, urlDefaults))}
      label="Feed scope"
      size="sm"
      fullWidth
      className="w-full sm:w-auto"
    />
  );
}
