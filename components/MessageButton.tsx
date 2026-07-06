"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, api, errorMessage } from "@/lib/api";

// MessageButton starts (or reopens) the 1:1 conversation with a user and routes
// to that thread. It's the entry point into messaging from anywhere we already
// know a user's id (e.g. a comment author). Rendered only for authenticated
// viewers who aren't the target; the backend rejects messaging yourself (422)
// and refuses a conversation when a block exists between the two (403).
export function MessageButton({ recipientId }: { recipientId: string }) {
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

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {busy ? "Opening…" : "Message"}
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </>
  );
}
