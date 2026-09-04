// The local watch path for a video.
//
// A video has TWO public names — its uuid and its opaque 11-character
// short_code (vidra-core migration 0126) — and /v/{code} is the one users see.
// Everything that links to a watch page should go through here rather than
// interpolating a path, so the shape lives in one place.
//
// The uuid form is not dead: it is what a caller falls back to when it holds
// only an id and no code. Several surfaces are in that position by nature —
// notifications, moderation queues, admin lists and search suggestions all
// carry a bare video_id, never a full video document — and /videos/{uuid}
// keeps working for them.

import type { Video } from "@/lib/api/types";

/** Just enough of a video to name it. */
export type Nameable = Pick<Video, "id"> & { short_code?: string };

/**
 * watchPath returns the path to a LOCAL video's watch page.
 *
 * Remote federated videos are not handled here: they live under /remote/{id}
 * and have no local code, so their callers branch before reaching this.
 */
export function watchPath(video: Nameable, query = ""): string {
  const code = video.short_code;
  if (code !== undefined && code !== "") return `/v/${code}${query}`;
  return `/videos/${video.id}${query}`;
}
