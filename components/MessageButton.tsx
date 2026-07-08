"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MessageCircleIcon } from "@/components/icons";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

// MessageButton starts (or reopens) the 1:1 conversation with a user and routes
// to that thread. It's the entry point into messaging from anywhere we already
// know a user's id (e.g. a comment author, a channel owner). Rendered only for
// authenticated viewers who aren't the target; the backend rejects messaging
// yourself (422) and refuses a conversation when a block exists (403).
//
// `variant` picks the skin: "inline" (default — the low-emphasis text link used
// under comments) or "pill" (the channel header cluster's hairline pill with the
// message-circle glyph). `compact` gives the pill the channel's responsive
// icon-circle: a 34px glyph-only circle on phones (the label supplies the
// accessible name), a labelled pill from sm up.
export function MessageButton({
  recipientId,
  variant = "inline",
  compact = false,
}: {
  recipientId: string;
  variant?: "inline" | "pill";
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const conv = await api.startConversation(recipientId);
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      // A block between the two users is a 403 — tell the viewer why.
      if (err instanceof ApiError && err.status === 403) {
        setError("You can't message this user.");
      } else {
        setError(errorMessage(err, "Could not open a conversation."));
      }
      setBusy(false);
    }
  }

  const text = busy ? "Opening…" : "Message";

  if (variant === "pill") {
    return (
      <>
        <button
          type="button"
          disabled={busy}
          onClick={() => void open()}
          aria-label={compact ? text : undefined}
          className={cn(
            "focus-ring flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border bg-transparent text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60",
            compact
              ? "h-[34px] w-[34px] sm:h-auto sm:w-auto sm:gap-1.5 sm:px-4 sm:py-2"
              : "gap-1.5 px-4 py-2",
          )}
        >
          <MessageCircleIcon size={16} />
          <span className={compact ? "hidden sm:inline" : undefined}>{text}</span>
        </button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
      >
        {text}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  );
}
