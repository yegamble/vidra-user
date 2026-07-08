"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LockIcon } from "@/components/icons";
import { ApiError, api, errorMessage } from "@/lib/api";
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
        setError(errorMessage(err, "Could not start an encrypted conversation."));
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
        className="focus-ring inline-flex items-center gap-1 rounded-full text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
      >
        <LockIcon size={14} />
        {busy ? "Opening…" : "Encrypted message"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  );
}
