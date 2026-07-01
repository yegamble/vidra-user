"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";

// MessageButton starts (or reopens) the 1:1 conversation with a user and routes
// to that thread. It's the entry point into messaging from anywhere we already
// know a user's id (e.g. a comment author). Rendered only for authenticated
// viewers who aren't the target; the backend rejects messaging yourself (422).
export function MessageButton({ recipientId }: { recipientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const conv = await api.startConversation(recipientId);
      router.push(`/messages/${conv.id}`);
    } catch {
      // Surface nothing inline (the row is transient); leave the button usable.
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void open()}
      className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      {busy ? "Opening…" : "Message"}
    </button>
  );
}
