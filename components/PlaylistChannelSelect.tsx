"use client";

import { useEffect, useState } from "react";

import { Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { Channel } from "@/lib/api";
import { collectPages } from "@/lib/collect-pages";

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
    // Every page, and only channels the caller OWNS: /me/channels also lists
    // editor-shared channels, which core refuses for a playlist (404).
    collectPages<Channel>(
      (window) =>
        api.getMyChannels(controller.signal, window).then((res) => ({ items: res.channels, total: res.total })),
      { signal: controller.signal },
    )
      .then((all) => setChannels(all.filter((c) => c.role === "owner")))
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
