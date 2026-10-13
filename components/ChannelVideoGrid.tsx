"use client";

import { ChannelVideoCard } from "@/components/ChannelVideoCard";
import type { Video } from "@/lib/api";

// ChannelVideoGrid is the dense channel video grid (DR6): the channel page's
// Videos tab and the profile's Videos tab render the same cards in the same
// grid, so a change to the grid lands in both.
export function ChannelVideoGrid({
  videos,
  label,
  onDeleted,
}: {
  videos: Video[];
  /** Accessible name of the list, e.g. "Videos by Ada". */
  label: string;
  onDeleted?: (video: Video) => void;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4 lg:gap-x-[18px]">
      {videos.map((video) => (
        <li key={video.id}>
          <ChannelVideoCard video={video} onDeleted={onDeleted ? () => onDeleted(video) : undefined} />
        </li>
      ))}
    </ul>
  );
}
