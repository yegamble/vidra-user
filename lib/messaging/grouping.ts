// buildTimeline — the pure heart of the Messaging v2 thread view. It turns a
// flat, oldest→newest message list into a sequence of render items: centered
// day/gap SEPARATORS, a single NEW-messages divider, and grouped message RUNS
// (consecutive same-sender messages within a short window). Keeping this pure
// (no React, no DOM, no clock unless injected) makes the run/separator/seen/
// divider rules exhaustively unit-testable.
//
// Rules (spec `.ralph/specs/messaging-v2.md` §4):
//   • separator before a message when the day changes OR the gap to the previous
//     message exceeds 60 minutes (and always before the very first message);
//   • a run = same sender AND ≤ 5-minute gap AND no separator/divider between;
//   • the NEW divider sits before the first unread peer message on open;
//   • "Seen" marks the LAST own (delivered, non-pending) message the peer's read
//     watermark covers — never per message, never a "delivered" tick.

import type { DMAttachment, LinkPreview } from "@/lib/api";

import { sameDay, separatorLabel } from "./time";

export type SendState = "sending" | "failed";

/**
 * A message as displayed in the timeline: the server `Message` fields we render,
 * plus optional optimistic-send state. `clientId` is set ONLY for a local,
 * not-yet-acknowledged message (so real-message logic — seen, unread — can skip
 * pending copies); server messages never carry it.
 */
export interface DisplayMessage {
  id: string;
  sender_id: string;
  sender_username?: string;
  sender_display_name?: string;
  body: string;
  created_at: string;
  deleted?: boolean;
  attachments?: DMAttachment[];
  preview?: LinkPreview;
  clientId?: string;
  sendState?: SendState;
}

export type RunPosition = "single" | "first" | "middle" | "last";

export interface TimelineRunMessage {
  message: DisplayMessage;
  /** Position within its run — drives the bubble's tail-corner radii. */
  position: RunPosition;
  /** True on the one message that carries the quiet "Seen" watermark. */
  seen: boolean;
}

export type TimelineItem =
  | { kind: "separator"; id: string; label: string; iso: string }
  | { kind: "new-divider"; id: string }
  | { kind: "run"; id: string; mine: boolean; senderId: string; messages: TimelineRunMessage[] };

export interface BuildTimelineOptions {
  /** The signed-in user's id — decides own vs other alignment + seen. */
  meId?: string;
  /** The peer's read watermark (last message id they've read), for "Seen". */
  peerReadId?: string;
  /** How many trailing peer messages are unread, for the NEW divider (0 = none). */
  unreadCount?: number;
  /** Injectable clock so separator labels are deterministic in tests. */
  now?: Date;
}

const RUN_GAP_MS = 5 * 60 * 1000; // ≤ 5 min → same run
const SEPARATOR_GAP_MS = 60 * 60 * 1000; // > 60 min → time separator

/** buildTimeline groups an oldest→newest message list into render items. */
export function buildTimeline(
  messages: DisplayMessage[],
  { meId, peerReadId, unreadCount = 0, now = new Date() }: BuildTimelineOptions = {},
): TimelineItem[] {
  if (messages.length === 0) return [];

  // The "Seen" anchor: the last own DELIVERED message the peer's watermark covers.
  let seenId: string | undefined;
  if (peerReadId) {
    const readIdx = messages.findIndex((m) => m.id === peerReadId);
    if (readIdx >= 0) {
      let lastMineIdx = -1;
      for (let i = 0; i < messages.length; i += 1) {
        const m = messages[i];
        if (m.sender_id === meId && !m.clientId) lastMineIdx = i;
      }
      if (lastMineIdx >= 0 && readIdx >= lastMineIdx) seenId = messages[lastMineIdx].id;
    }
  }

  // The NEW-divider anchor: the first of the last `unreadCount` peer messages.
  let firstUnreadId: string | undefined;
  if (unreadCount > 0) {
    const peerMessages = messages.filter((m) => m.sender_id !== meId && !m.clientId);
    if (peerMessages.length > 0) {
      const idx = Math.max(0, peerMessages.length - unreadCount);
      firstUnreadId = peerMessages[idx].id;
    }
  }

  const items: TimelineItem[] = [];
  let currentRun: Extract<TimelineItem, { kind: "run" }> | null = null;

  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    const prev = i > 0 ? messages[i - 1] : undefined;

    const dayChanged = !prev || !sameDay(prev.created_at, m.created_at);
    const gapMs = prev
      ? new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()
      : 0;
    const needsSeparator = !prev || dayChanged || gapMs > SEPARATOR_GAP_MS;
    const isFirstUnread = m.id === firstUnreadId;

    if (needsSeparator) {
      items.push({
        kind: "separator",
        id: `sep-${m.id}`,
        label: separatorLabel(m.created_at, now),
        iso: m.created_at,
      });
      currentRun = null;
    }
    if (isFirstUnread) {
      items.push({ kind: "new-divider", id: `new-${m.id}` });
      currentRun = null;
    }

    const continuesRun =
      currentRun !== null &&
      prev !== undefined &&
      prev.sender_id === m.sender_id &&
      gapMs <= RUN_GAP_MS &&
      !needsSeparator &&
      !isFirstUnread;

    if (continuesRun && currentRun) {
      currentRun.messages.push({ message: m, position: "single", seen: m.id === seenId });
    } else {
      currentRun = {
        kind: "run",
        id: `run-${m.id}`,
        mine: m.sender_id === meId,
        senderId: m.sender_id,
        messages: [{ message: m, position: "single", seen: m.id === seenId }],
      };
      items.push(currentRun);
    }
  }

  // Assign run-position radii once each run is complete.
  for (const item of items) {
    if (item.kind !== "run") continue;
    const n = item.messages.length;
    item.messages.forEach((rm, idx) => {
      rm.position =
        n === 1 ? "single" : idx === 0 ? "first" : idx === n - 1 ? "last" : "middle";
    });
  }

  return items;
}
