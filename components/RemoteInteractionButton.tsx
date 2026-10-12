"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ExternalLinkIcon } from "@/components/icons";
import { Button, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api } from "@/lib/api";
import {
  browserSubscribeUrl,
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
  const [manualTarget, setManualTarget] = useState<string | null>(null);
  const { run, busy, error, setError } = useAsyncAction(
    async (parsed: string) => {
      const target = interactionTarget(window.location.origin, kind, id);
      setManualTarget(null);
      let res;
      try {
        res = await api.resolveRemoteInteraction(parsed, target);
      } catch (err) {
        // The operator keeps server-side lookups for signed-out visitors off:
        // ask the visitor's own server from their browser instead, and if the
        // browser is not allowed to (CORS), show them what to search for.
        if (err instanceof ApiError && err.status === 403) {
          const direct = await browserSubscribeUrl(parsed, target);
          if (direct) {
            navigate(direct);
            return;
          }
          setManualTarget(target);
          return;
        }
        throw err;
      }
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
      {/* Icon-only between the phone stack and the md breakpoint: the channel
          header row stops wrapping at sm, and a long text pill there pushes the
          action cluster past the content edge. The accessible name is always
          the full label. */}
      <Button
        variant="tonal"
        size="sm"
        className={className}
        aria-label={LABEL[kind]}
        title={LABEL[kind]}
        onClick={() => setOpen(true)}
      >
        <ExternalLinkIcon size={16} strokeWidth={2} />
        <span className="hidden max-sm:inline md:inline">{LABEL[kind]}</span>
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
                setManualTarget(null);
              }}
            />
            {manualTarget ? (
              <div role="status" className="text-sm text-fg-muted">
                We couldn’t reach your server from here. Search for this{" "}
                {kind === "channel" ? "channel" : "video"} on your server:
                <input
                  readOnly
                  aria-label="Address to search for on your server"
                  value={manualTarget}
                  onFocus={(e) => e.currentTarget.select()}
                  className="focus-ring mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg"
                />
              </div>
            ) : null}
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
