"use client";

import { useRouter } from "next/navigation";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";

export type InboxTab = "notifications" | "messages";

const OPTIONS = [
  { value: "notifications", label: "Notifications" },
  { value: "messages", label: "Messages" },
] as const;

// InboxTabs is the design's mobile Inbox switcher: a rounded-rect SegmentedControl
// toggling the two halves of the Inbox — Notifications (`/notifications`) and
// Messages (`/messages`). The two live on separate routes (Messages keeps its
// persistent desktop split-pane rail), so the control acts as cross-route
// navigation rather than in-place state: choosing the inactive segment pushes its
// route (client-side, so the in-memory session survives). It is PHONE-ONLY
// (`sm:hidden`, matching the bottom tab bar) because the design frames the segmented
// Inbox as a mobile pattern — on desktop, Messages is its own sidebar destination
// and notifications live in the header bell popover.
export function InboxTabs({ active, className }: { active: InboxTab; className?: string }) {
  const router = useRouter();
  return (
    <div className={cn("sm:hidden", className)}>
      <SegmentedControl
        options={OPTIONS}
        value={active}
        onChange={(value) => router.push(value === "messages" ? "/messages" : "/notifications")}
        label="Inbox sections"
        fullWidth
      />
    </div>
  );
}
