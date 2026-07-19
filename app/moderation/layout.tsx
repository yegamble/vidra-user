import type { ReactNode } from "react";

import { ModerationSectionNav } from "@/components/ModerationSectionNav";

// Split-view shell for every moderation surface: a section rail (`md`+) /
// compact switcher (mobile) beside the active section's content. Each child page
// renders its own <main>, so exactly one <main> is in the tree per route.
export default function ModerationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-6 md:py-8">
      <ModerationSectionNav />
      {children}
    </div>
  );
}
