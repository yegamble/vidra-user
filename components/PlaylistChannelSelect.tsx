"use client";

import { useEffect, useState } from "react";

import { Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { Channel } from "@/lib/api";

// PlaylistChannelSelect is the optional "Channel" picker on playlist create and
// edit: the caller's own channels, or "None". Core only accepts a channel the
// playlist's owner owns, so the list is /me/channels. value "" means None.
export function PlaylistChannelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (channelId: string) => void;
  disabled?: boolean;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyChannels(controller.signal)
      .then((res) => setChannels(res.channels))
      .catch(() => {
        // The picker is optional: without the list it offers only "None".
      });
    return () => controller.abort();
  }, []);
  return (
    <Select
      label="Channel"
      aria-label="Channel"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">None</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          {c.display_name || c.handle}
        </option>
      ))}
    </Select>
  );
}
