"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { MessageGroup } from "@/components/messaging/MessageGroup";
import { NewMessagesDivider, TimeSeparator } from "@/components/messaging/TimeSeparator";
import { buildTimeline, type DisplayMessage } from "@/lib/messaging/grouping";

const STICK_THRESHOLD = 120; // within this many px of the bottom → auto-stick
const PILL_THRESHOLD = 300; // past this → show the scroll-to-bottom pill

// MessageTimeline owns the thread's scroll container (the page no longer
// scrolls). It is a `role="log"` live region so appended messages are announced
// without stealing focus; it opens pinned to the bottom (pre-paint), auto-sticks
// only while the reader is near the bottom, and otherwise preserves position and
// surfaces a "N new" scroll-to-bottom pill. All programmatic scrolling is
// instant (`scrollTop =`) — reduced-motion safe.
export function MessageTimeline({
  messages,
  meId,
  peerReadId,
  unreadCount = 0,
  otherName,
  onDeleted,
  onRetry,
  onDiscard,
  onAtBottomChange,
}: {
  messages: DisplayMessage[];
  meId?: string;
  peerReadId?: string;
  unreadCount?: number;
  otherName: string;
  onDeleted: (id: string) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  onAtBottomChange?: (atBottom: boolean) => void;
}) {
  const items = useMemo(
    () => buildTimeline(messages, { meId, peerReadId, unreadCount }),
    [messages, meId, peerReadId, unreadCount],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // near the bottom → stick on new messages
  const initializedRef = useRef(false);
  const prevLenRef = useRef(0);
  const [showPill, setShowPill] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const len = messages.length;
    const last = len > 0 ? messages[len - 1] : undefined;
    const lastMine = last ? last.sender_id === meId : false;

    if (!initializedRef.current) {
      if (len > 0) {
        initializedRef.current = true;
        el.scrollTop = el.scrollHeight;
        onAtBottomChange?.(true);
      }
      prevLenRef.current = len;
      return;
    }

    const grew = len > prevLenRef.current;
    const delta = len - prevLenRef.current;
    prevLenRef.current = len;

    if (stickRef.current || (grew && lastMine)) {
      el.scrollTop = el.scrollHeight;
    } else if (grew && !lastMine) {
      setNewCount((n) => n + delta);
    }
  }, [messages, meId, onAtBottomChange]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < STICK_THRESHOLD;
    stickRef.current = atBottom;
    setShowPill(distance > PILL_THRESHOLD);
    if (atBottom) setNewCount(0);
    onAtBottomChange?.(atBottom);
  }

  function jumpToLatest() {
    stickRef.current = true;
    setNewCount(0);
    setShowPill(false);
    scrollToBottom();
    onAtBottomChange?.(true);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label={`Conversation with ${otherName}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            No messages yet. Say hello.
          </p>
        ) : (
          <ol className="flex flex-col">
            {items.map((item) => {
              if (item.kind === "separator") {
                return <TimeSeparator key={item.id} label={item.label} iso={item.iso} />;
              }
              if (item.kind === "new-divider") {
                return <NewMessagesDivider key={item.id} />;
              }
              return (
                <li key={item.id} className="mt-3 first:mt-0">
                  <MessageGroup
                    run={item}
                    otherName={otherName}
                    onDeleted={onDeleted}
                    onRetry={onRetry}
                    onDiscard={onDiscard}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {showPill ? (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label={
            newCount > 0
              ? `Jump to latest, ${newCount} new ${newCount === 1 ? "message" : "messages"}`
              : "Jump to latest"
          }
          className="focus-ring absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-3 py-2 text-[12px] font-semibold text-fg shadow-soft-strong transition-colors hover:bg-surface-muted"
        >
          <ChevronDownIcon size={16} strokeWidth={2} />
          {newCount > 0 ? <span className="tabular-nums">{newCount} new</span> : null}
        </button>
      ) : null}
    </div>
  );
}
