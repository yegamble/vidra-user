"use client";

import { usePathname } from "next/navigation";

import { MessageCircleIcon } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { useMessagingAvailable } from "@/lib/messaging/availability";

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
  const messagingAvailable = useMessagingAvailable();

  // The nav entry is already gone when the operator turns messaging off, but the
  // route stays reachable by URL or back button. Say why plainly instead of
  // mounting a rail and a thread whose every request answers 403.
  if (!messagingAvailable) {
    return (
      <PageShell gutters="desktop" className="flex min-h-0">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16">
          <EmptyState
            icon={<MessageCircleIcon size={24} />}
            title="Messaging is turned off"
            message="This instance's operator has disabled direct messages."
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell data-messaging-shell="" gutters="desktop" className="flex min-h-0">
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
    </PageShell>
  );
}
