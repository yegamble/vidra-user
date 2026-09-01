"use client";

import { useState } from "react";

import { BellIcon, BellOffIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/IconButton";
import type { IconButtonSize } from "@/components/ui/IconButton";
import { api } from "@/lib/api";
import type { NotificationSetting } from "@/lib/api";

// FollowBell is the per-channel notification bell beside a follow
// (PUT /channels/{handle}/follow/notifications). Core starts every follow at
// "all" and denormalises `notification_setting` onto the channel payload AND
// onto every /me/subscriptions row precisely so this control paints from data
// the caller already holds: the bell is SEEDED, never fetched, so a list of 50
// follows costs zero extra requests. Two states only — the contract has
// "all" | "none" and deliberately no "personalized" middle mode.
//
// The flip is optimistic and REVERTS on failure, like ReadReceiptsToggle: a
// bell that looked muted while core kept sending every new-video notification
// would be worse than no control at all.
export function FollowBell({
  handle,
  channelName,
  setting,
  onChange,
  size = "md",
  className,
}: {
  handle: string;
  /** Display name used in the accessible name, so rows in a list stay distinct. */
  channelName: string;
  setting: NotificationSetting;
  onChange?: (next: NotificationSetting) => void;
  size?: IconButtonSize;
  className?: string;
}) {
  const [value, setValue] = useState<NotificationSetting>(setting);
  const [busy, setBusy] = useState(false);

  // Re-seed when the owner swaps the row underneath us (React's "adjusting
  // state when a prop changes"), the same idiom FollowButton uses.
  const [prevSetting, setPrevSetting] = useState(setting);
  if (setting !== prevSetting) {
    setPrevSetting(setting);
    setValue(setting);
  }

  const on = value === "all";

  async function toggle() {
    const previous = value;
    const next: NotificationSetting = on ? "none" : "all";
    setValue(next);
    setBusy(true);
    try {
      const res = await api.setFollowNotifications(handle, next);
      setValue(res.notification_setting);
      onChange?.(res.notification_setting);
    } catch {
      setValue(previous); // revert the optimistic flip
      onChange?.(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton
      label={`Notifications ${on ? "on" : "off"} for ${channelName}`}
      aria-pressed={on}
      size={size}
      disabled={busy}
      onClick={() => void toggle()}
      className={className}
    >
      {on ? <BellIcon size={18} /> : <BellOffIcon size={18} />}
    </IconButton>
  );
}
