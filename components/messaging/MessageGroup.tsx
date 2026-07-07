"use client";

import { MessageBubble } from "@/components/messaging/MessageBubble";
import { Avatar } from "@/components/ui/Avatar";
import { userAvatarUrl } from "@/lib/api";
import type { TimelineItem } from "@/lib/messaging/grouping";

type Run = Extract<TimelineItem, { kind: "run" }>;

// MessageGroup renders one run of consecutive same-sender bubbles. Own runs hug
// the right with no avatar; other-party runs reserve a 28px avatar gutter and
// render the peer's avatar ONCE, bottom-aligned with the run's last bubble
// (spec §4). The avatar is decorative (aria-hidden via alt="") — each bubble
// already names its sender in its accessible name.
export function MessageGroup({
  run,
  otherName,
  onDeleted,
  onRetry,
  onDiscard,
}: {
  run: Run;
  otherName: string;
  onDeleted: (id: string) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}) {
  if (run.mine) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        {run.messages.map((rm) => (
          <MessageBubble
            key={rm.message.clientId ?? rm.message.id}
            rm={rm}
            mine
            onDeleted={onDeleted}
            onRetry={onRetry}
            onDiscard={onDiscard}
          />
        ))}
      </div>
    );
  }

  const lastIndex = run.messages.length - 1;
  return (
    <div className="flex flex-col gap-0.5">
      {run.messages.map((rm, idx) => (
        <div key={rm.message.id} className="flex items-end gap-2">
          <div className="w-7 shrink-0">
            {idx === lastIndex ? (
              <span data-testid="run-avatar">
                <Avatar
                  src={userAvatarUrl(run.senderId)}
                  name={otherName}
                  alt=""
                  className="h-7 w-7 text-xs"
                />
              </span>
            ) : null}
          </div>
          <MessageBubble
            rm={rm}
            mine={false}
            onDeleted={onDeleted}
            onRetry={onRetry}
            onDiscard={onDiscard}
          />
        </div>
      ))}
    </div>
  );
}
