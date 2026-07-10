"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useE2EEAvailable } from "@/lib/e2ee/availability";
import { stashEncryptedDraft } from "@/lib/e2ee/drafts";

// The backend caps a message body at 5000 chars (SendMessageRequest.body).
const MAX_MESSAGE_LEN = 5000;

// NewMessageButton is the "start a fresh conversation" entry point in the
// conversation rail (/messages). Unlike MessageButton (which already knows a
// user's id from a comment), here the viewer types the recipient's *username*:
// the composer resolves it server-side by starting the conversation, sends the
// first message, then routes to the thread. Rendered only inside the rail's
// authenticated branch. Styled as a compact compose icon button (template
// language) with the accessible name "New message".
export function NewMessageButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="New message"
        title="New message"
        className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      {open ? <ComposeDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ComposeDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const e2eeAvailable = useE2EEAvailable(true);
  const [username, setUsername] = useState("");
  const [body, setBody] = useState("");
  const [encrypted, setEncrypted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = username.trim() !== "" && body.trim() !== "" && !busy;

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      // Start (or reopen) the 1:1 conversation by username. Plaintext mode
      // posts the first message here; encrypted mode hands the draft to the
      // encrypted thread, which must perform device setup + encryption first.
      const conv = await api.startConversation({
        recipientUsername: username.trim(),
        ...(encrypted ? { encrypted: true } : {}),
      });
      if (encrypted) {
        // The encrypted thread owns device setup and encryption. Carry the
        // plaintext only through process memory, never through the URL or
        // browser storage, then let its composer consume it after setup.
        stashEncryptedDraft(conv.id, body);
        onClose();
        router.push(
          `/messages/${conv.id}?to=${encodeURIComponent(conv.other_user_id)}`,
        );
        return;
      }
      await api.sendMessage(conv.id, body.trim());
      // Close before navigating: the dialog lives in the persistent conversation
      // rail (it does not unmount on route change), so it must dismiss itself.
      onClose();
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      // Honest, backend-driven states: an unknown/inactive username is a 404, a
      // block either way is a 403, and messaging yourself is a 422 (our request
      // always carries exactly recipient_username, so a 422 can only be self).
      if (err instanceof ApiError && err.status === 404) {
        setError("No user found with that username.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("You can't message this user.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("You can't message yourself.");
      } else {
        setError(errorMessage(err, "Could not start the conversation."));
      }
      setBusy(false);
    }
  }

  return (
    <Modal title="New message" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          label="Username"
          placeholder="Who do you want to message?"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          error={error ?? undefined}
        />
        <Textarea
          label="Message"
          placeholder="Write a message"
          rows={4}
          maxLength={MAX_MESSAGE_LEN}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {e2eeAvailable === true ? (
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2.5">
            <Checkbox
              label="End-to-end encrypted"
              checked={encrypted}
              disabled={busy}
              onChange={(e) => setEncrypted(e.target.checked)}
            />
            {encrypted ? (
              <p className="mt-1 pl-6 text-xs text-fg-muted">
                You&rsquo;ll review and send this message from the encrypted conversation after it
                opens.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSend}>
            {busy ? (encrypted ? "Opening…" : "Sending…") : encrypted ? "Continue" : "Send"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
