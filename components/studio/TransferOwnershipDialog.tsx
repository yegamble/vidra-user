"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api, errorMessage } from "@/lib/api";

type Step = "form" | "confirm" | "sending" | "sent";

// TransferOwnershipDialog offers one of the caller's videos to another member
// of this instance (core 0165, PeerTube's "give ownership"). Two steps on
// purpose: handing a video away is not undone by the giver, so the confirm step
// says what happens — nothing until the recipient accepts, then the video
// leaves the caller's channel for good.
export function TransferOwnershipDialog({
  videoId,
  videoTitle,
  onClose,
}: {
  videoId: string;
  videoTitle: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  // People type handles the way the app shows them; the server wants the bare name.
  const name = username.trim().replace(/^@/, "");

  async function send() {
    setStep("sending");
    setError(null);
    try {
      await api.giveVideoOwnership(videoId, name);
      setStep("sent");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404 && /user/i.test(err.message)
          ? `No one on this instance can receive videos as @${name}. Check the username.`
          : errorMessage(err, "Could not send the transfer request."),
      );
      setStep("confirm");
    }
  }

  return (
    <Modal title="Transfer ownership" onClose={onClose}>
      {step === "form" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name !== "") setStep("confirm");
          }}
        >
          <Input
            label="Recipient's username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            hint="They need an account on this instance. They choose which of their channels it goes to."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={name === ""}>
              Continue
            </Button>
          </div>
        </form>
      ) : step === "sent" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-fg">
            Request sent. @{name} can accept or refuse it from their Studio; until then the video
            stays in your channel.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-fg">
            Offer “{videoTitle}” to @{name}?
          </p>
          <p className="text-sm text-fg-muted">
            Nothing changes until they accept. Once they do, the video moves to one of their
            channels, with its views and comments, and you can no longer edit or delete it.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={step === "sending"}
              onClick={() => {
                setError(null);
                setStep("form");
              }}
            >
              Back
            </Button>
            <Button size="sm" disabled={step === "sending"} onClick={() => void send()}>
              Send request
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
