"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LockIcon } from "@/components/e2ee/LockIcon";
import { ApiError, api } from "@/lib/api";
import { useE2EEAvailable } from "@/lib/e2ee/availability";

// StartEncryptedButton starts (or reopens) the ENCRYPTED 1:1 conversation with a
// user and routes to that thread. Per the spec's no-pretending rule it renders
// nothing until the backend advertises the E2EE contract (probe). The recipient
// id is threaded through as ?to= so the encrypted thread can fan out to them
// without a separate participant lookup.
export function StartEncryptedButton({ recipientId }: { recipientId: string }) {
  const router = useRouter();
  const available = useE2EEAvailable(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden entirely unless E2EE is advertised — no pretending the feature exists.
  if (available !== true) return null;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const conv = await api.startConversation(recipientId, { encrypted: true });
      router.push(`/messages/${conv.id}?to=${encodeURIComponent(recipientId)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You can't message this user.");
      } else {
        setError("Could not start an encrypted conversation.");
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
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <LockIcon />
        {busy ? "Opening…" : "Encrypted message"}
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </>
  );
}
