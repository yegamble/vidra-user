"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api, errorMessage } from "@/lib/api";

// The backend caps a message body at 5000 chars (SendMessageRequest.body).
const MAX_MESSAGE_LEN = 5000;

// NewMessageButton is the "start a fresh conversation" entry point on the inbox
// (/messages). Unlike MessageButton (which already knows a user's id from a
// comment), here the viewer types the recipient's *username*: the composer
// resolves it server-side by starting the conversation, sends the first message,
// then routes to the thread. Rendered only inside MessagesView's authenticated
// branch.
export function NewMessageButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        New message
      </Button>
      {open ? <ComposeDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ComposeDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = username.trim() !== "" && body.trim() !== "" && !busy;

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      // Start (or reopen) the 1:1 conversation by username, post the first
      // message, then route to the thread with a client-side nav so the
      // in-memory session survives (a hard load lands signed out).
      const conv = await api.startConversation({ recipientUsername: username.trim() });
      await api.sendMessage(conv.id, body.trim());
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
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSend}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
