"use client";

import { useState } from "react";

import { LinkPreviewCard } from "@/components/messaging/LinkPreviewCard";
import { MessageAttachments } from "@/components/messaging/MessageAttachments";
import { ReportButton } from "@/components/ReportButton";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { RunPosition, TimelineRunMessage } from "@/lib/messaging/grouping";
import { absoluteTime } from "@/lib/messaging/time";

// The tail-corner radii per run position: the base bubble is rounded-[18px] and
// the corner(s) on the SENDER's side collapse to 6px within a run, so a run of
// bubbles reads as one grouped cluster with a single small "tail" corner on the
// last bubble (spec §4). Own = right side, other = left side.
function radiusClass(mine: boolean, position: RunPosition): string {
  if (mine) {
    switch (position) {
      case "single":
        return "rounded-br-md";
      case "first":
        return "rounded-br-[6px]";
      case "middle":
        return "rounded-tr-[6px] rounded-br-[6px]";
      case "last":
        return "rounded-tr-[6px] rounded-br-md";
    }
  }
  switch (position) {
    case "single":
      return "rounded-bl-md";
    case "first":
      return "rounded-bl-[6px]";
    case "middle":
      return "rounded-tl-[6px] rounded-bl-[6px]";
    case "last":
      return "rounded-tl-[6px] rounded-bl-md";
  }
}

// DeleteAction soft-deletes (tombstones) one of the caller's own messages.
function DeleteAction({ id, onDeleted }: { id: string; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  async function del() {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteMessage(id);
      onDeleted(id);
    } catch {
      setDeleting(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void del()}
      disabled={deleting}
      aria-label="Delete this message"
      className="focus-ring rounded px-1 text-[11px] font-semibold text-fg-muted transition-colors hover:text-danger disabled:opacity-60"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}

// MessageBubble renders one message: the bubble (run-position radii, own/other
// colours), its inline attachments/link-preview, a hover/focus-revealed action
// (Delete own / Report peer), and — under the LAST own message only — the quiet
// "Seen" / optimistic "Sending…" / "Not sent · Retry" status row. The visible
// bubble carries NO timestamp; the exact time lives in a visually-hidden
// `<time>` + the bubble's `title`, and in the accessible name prefix.
export function MessageBubble({
  rm,
  mine,
  onDeleted,
  onRetry,
  onDiscard,
}: {
  rm: TimelineRunMessage;
  mine: boolean;
  onDeleted: (id: string) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}) {
  const { message: m, position, seen } = rm;
  const senderName = mine
    ? "You"
    : m.sender_display_name || m.sender_username || "They";
  const abs = absoluteTime(m.created_at);
  const pending = m.sendState === "sending";
  const failed = m.sendState === "failed";
  // A message that is only media (no body) drops the bubble chrome — the masked
  // media is the bubble (spec §4). A tombstone always keeps a bubble.
  const mediaOnly =
    !m.deleted && !m.body && (m.attachments?.length ?? 0) > 0;

  const bubble = (
    <div
      title={abs}
      className={cn(
        "max-w-full px-3.5 py-2.5 text-[14.5px] leading-normal",
        mediaOnly ? "overflow-hidden rounded-2xl p-0" : "rounded-[18px]",
        !mediaOnly && radiusClass(mine, position),
        !mediaOnly && (mine ? "bg-accent text-accent-fg" : "bg-surface-muted text-fg"),
        pending && "opacity-60",
      )}
    >
      {/* Accessible name: "{sender}, {absolute time}: {content}". */}
      <span className="sr-only">{senderName}, </span>
      <time dateTime={m.created_at} className="sr-only">
        {abs}
      </time>
      <span className="sr-only">: </span>
      {m.deleted ? (
        <span className="text-sm italic opacity-70">[deleted]</span>
      ) : (
        <>
          {m.body ? (
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          ) : null}
          <MessageAttachments attachments={m.attachments} />
          {m.preview ? <LinkPreviewCard preview={m.preview} /> : null}
        </>
      )}
    </div>
  );

  // The per-message action (Delete/Report) sits beside the bubble, revealed on
  // hover/focus (always shown on coarse pointers, where hover is unavailable).
  const showAction = !m.deleted && !pending && !failed;

  return (
    <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
      <div className="group/msg relative">
        {bubble}
        {showAction ? (
          <div
            // Vertically centred with inset-y-0 + flex (NOT a transform: a
            // transformed ancestor would become the containing block for the
            // Report Modal's position:fixed and mis-anchor the dialog).
            className={cn(
              "absolute inset-y-0 flex items-center whitespace-nowrap opacity-0 transition-opacity",
              "group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 [@media(pointer:coarse)]:opacity-100",
              mine ? "right-full mr-1.5" : "left-full ml-1.5",
            )}
          >
            {mine ? (
              <DeleteAction id={m.id} onDeleted={onDeleted} />
            ) : (
              <ReportButton kind="message" targetId={m.id} variant="link" />
            )}
          </div>
        ) : null}
      </div>

      {seen ? (
        <span className="mt-0.5 text-[11px] text-fg-muted">Seen</span>
      ) : null}
      {pending ? (
        <span className="mt-0.5 text-[11px] text-fg-muted">Sending…</span>
      ) : null}
      {failed && m.clientId ? (
        <span role="alert" className="mt-0.5 flex items-center gap-1.5 text-[11px] text-danger">
          Not sent ·{" "}
          <button
            type="button"
            onClick={() => onRetry(m.clientId as string)}
            className="focus-ring rounded font-semibold underline transition-colors hover:text-fg"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => onDiscard(m.clientId as string)}
            aria-label="Discard unsent message"
            className="focus-ring rounded font-semibold text-fg-muted underline transition-colors hover:text-fg"
          >
            Discard
          </button>
        </span>
      ) : null}
    </div>
  );
}
