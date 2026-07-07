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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>
      <p className="text-lg font-semibold tracking-tight text-fg">Your messages</p>
      <p className="max-w-xs text-sm text-fg-muted">Pick a conversation, or start a new one.</p>
    </div>
  );
}
