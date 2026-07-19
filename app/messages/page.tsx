import { MessageCircleIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";

// The desktop split-pane's right pane when no thread is open. On phones the
// shell hides this pane entirely (the rail is the full-width inbox); on ≥ lg it
// is the resting "Your messages" placeholder beside the conversation rail, using
// the shared EmptyState (icon-in-tinted-circle) treatment.
export default function MessagesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
      <EmptyState
        icon={<MessageCircleIcon size={24} />}
        title="Your messages"
        message="Pick a conversation, or start a new one."
      />
    </div>
  );
}
