import { MessageCircleIcon } from "@/components/icons";

// The desktop split-pane's right pane when no thread is open. On phones the
// shell hides this pane entirely (the rail is the full-width inbox); on ≥ lg it
// is the resting "Your messages" placeholder beside the conversation rail.
export default function MessagesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted text-fg-muted"
      >
        <MessageCircleIcon size={24} />
      </span>
      <p className="text-lg font-semibold tracking-tight text-fg">Your messages</p>
      <p className="max-w-xs text-sm text-fg-muted">Pick a conversation, or start a new one.</p>
    </div>
  );
}
