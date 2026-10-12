"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Button, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api } from "@/lib/api";
import {
  interactionTarget,
  parseFediverseHandle,
  safeSubscribeUrl,
  type InteractionKind,
} from "@/lib/remote-interaction";
import { useAsyncAction } from "@/lib/use-async-action";

const LABEL: Record<InteractionKind, string> = {
  channel: "Follow from another server",
  video: "Interact from your instance",
};

// RemoteInteractionButton is the signed-OUT half of fediverse interaction: a
// visitor with an account on another server types their handle and is sent to
// THEIR server's subscribe page for this channel/video (found by core via
// WebFinger on their server). Renders nothing for signed-in viewers, who use
// the normal buttons. The target is built from this page's own origin; core
// refuses any id that is not on this instance, and the returned URL is
// re-checked to be https before the browser follows it.
export function RemoteInteractionButton({
  kind,
  id,
  className,
  navigate = (url: string) => window.location.assign(url),
}: {
  kind: InteractionKind;
  /** Channel handle, or video id. */
  id: string;
  className?: string;
  /** Test seam for the navigation. */
  navigate?: (url: string) => void;
}) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const { run, busy, error, setError } = useAsyncAction(
    async (parsed: string) => {
      const res = await api.resolveRemoteInteraction(
        parsed,
        interactionTarget(window.location.origin, kind, id),
      );
      const url = safeSubscribeUrl(res.url);
      if (!url) throw new Error("unsafe");
      navigate(url);
    },
    "Could not reach that server. Try again in a moment.",
    (err) => {
      if (!(err instanceof ApiError)) return null;
      if (err.status === 404) return "That server doesn’t support following from elsewhere.";
      if (err.status === 422) return "That server can’t be used. Check the handle.";
      if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
      if (err.status === 503) return "This instance has federation turned off.";
      return null;
    },
  );

  if (status !== "anon") return null;

  function submit() {
    if (busy) return;
    const parsed = parseFediverseHandle(handle);
    if (!parsed) {
      setError("Enter your handle as user@server.example.");
      return;
    }
    void run(parsed);
  }

  return (
    <>
      <Button variant="tonal" size="sm" className={className} onClick={() => setOpen(true)}>
        {LABEL[kind]}
      </Button>
      {open ? (
        <Modal title={LABEL[kind]} onClose={() => setOpen(false)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p className="text-sm text-fg-muted">
              Enter your handle on Mastodon, PeerTube or another fediverse server and we’ll
              take you there to continue.
            </p>
            <Input
              label="Your fediverse handle"
              placeholder="user@server.example"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setError(null);
              }}
            />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy || handle.trim() === ""}>
              {busy ? "Looking up…" : "Continue"}
            </Button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
