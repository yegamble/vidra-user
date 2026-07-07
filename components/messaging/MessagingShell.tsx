"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { ConversationRail } from "./ConversationRail";

// MessagingShell is the messenger's route-aware layout, shared by /messages and
// /messages/[id] (a Next layout, so the rail never unmounts when you swap
// threads). Behaviour by breakpoint:
//   • ≥ lg: a two-pane split — a fixed 360px conversation rail (always visible)
//     beside the thread pane (empty-pane placeholder on /messages). The page
//     itself never scrolls; each pane owns its scroll.
//   • < lg: single-pane routing — /messages shows the rail full-width;
//     /messages/[id] shows only the thread (its header carries a back chevron).
// The whole shell is the page's single <main> landmark.
export function MessagingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Any /messages/[id] route (usePathname drops the query string).
  const onThread = pathname !== "/messages";

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1">
      <div
        className={cn(
          "min-h-0 flex-col lg:flex lg:w-[360px] lg:flex-none lg:shrink-0 lg:border-r lg:border-border-subtle",
          onThread ? "hidden lg:flex" : "flex flex-1",
        )}
      >
        <ConversationRail titleAsH1={!onThread} />
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-col",
          onThread ? "flex flex-1" : "hidden lg:flex lg:flex-1",
        )}
      >
        {children}
      </div>
    </main>
  );
}
