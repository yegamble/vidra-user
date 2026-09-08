"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { api, errorMessage } from "@/lib/api";
import type { LiveTerminationReason } from "@/lib/api";
import { TERMINATION_REASONS, terminationReasonLabel } from "@/lib/live/termination";

/**
 * LiveTerminateDialog — the moderator's control for ending a broadcast.
 *
 * It exists because the capability had no reachable surface: core now refuses a
 * live stream on a moderator's word, and a moderation power an actual moderator
 * cannot invoke is not a moderation power. The alternative on offer before this
 * was, verbatim from the A26 lab, "change a global setting, delete the account,
 * or nothing".
 *
 * Two design decisions worth naming:
 *
 * The reason code is REQUIRED and the free text is not. The code is what the
 * audit trail carries and what the creator's page turns into a sentence, so it
 * cannot be optional; the words are for the creator and a moderator in a hurry
 * on a live broadcast should not be blocked on writing them.
 *
 * The confirmation reports a PARTIAL outcome rather than closing on "done". The
 * three parts of a termination fail independently — the broadcast always ends,
 * but the key rotation can fail and the publisher's socket can survive — and a
 * moderator who closes this dialog believing the streamer is gone, while they
 * are still uploading, has been misled at the moment it matters most.
 */
export function LiveTerminateDialog({
  streamId,
  streamTitle,
  onClose,
  onTerminated,
}: {
  streamId: string;
  streamTitle: string;
  onClose: () => void;
  /** Called after a successful termination so the caller can reload the stream. */
  onTerminated: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<LiveTerminationReason>("policy_violation");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.terminateLiveStream(streamId, {
        reason_code: reasonCode,
        reason: reason.trim() || undefined,
      });
      onTerminated();
      if (res.detail) {
        // A partial outcome keeps the dialog open with the sentence core wrote:
        // it names what survived and what to do about it, which is more use than
        // a toast that disappears.
        setOutcome(res.detail);
      } else {
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err, "Could not end this stream."));
    } finally {
      setBusy(false);
    }
  }

  if (outcome) {
    return (
      <Modal title="Stream ended, with a warning" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-fg-muted">{outcome}</p>
          <div>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="End this stream" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Ends <strong className="font-semibold text-fg">{streamTitle}</strong> for everyone
          watching, rotates its stream key so the broadcaster cannot restart it, and disconnects
          them from the ingest server. The stream and any replay are kept.
        </p>
        <Select
          label="Reason"
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value as LiveTerminationReason)}
          aria-label="Termination reason"
        >
          {TERMINATION_REASONS.map((code) => (
            <option key={code} value={code}>
              {terminationReasonLabel(code)}
            </option>
          ))}
        </Select>
        <Input
          label="Note to the creator (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What happened, in your words"
          aria-label="Note to the creator"
          maxLength={1000}
        />
        <p className="text-[12px] leading-relaxed text-fg-muted">
          The creator sees the reason and your note on the stream page and in their Studio. Nobody
          else does.
        </p>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Ending…" : "End stream"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </form>
    </Modal>
  );
}
