import { MessagingShell } from "@/components/messaging/MessagingShell";

// The messaging routes (/messages and /messages/[id]) share one layout so the
// conversation rail persists across thread navigation (desktop split-pane) and
// the pair renders exactly one <main> landmark.
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <MessagingShell>{children}</MessagingShell>;
}
