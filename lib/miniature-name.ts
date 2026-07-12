// Video-miniature attribution naming (config-parity W5:
// miniature_prefer_author_display_name). When the operator turns the flag on,
// cards credit the UPLOADER ACCOUNT's display name instead of the channel's.
//
// W9 closed the W5 payload gap: vidra-core now sends `author_display_name`
// (the uploader account's display name) on the feed/search/channel/detail
// payloads next to the channel identity. It is still optional — omitted on
// remote cards and while the account has no display name set — so the
// resolver keeps its channel-name fallback.

import type { Video } from "@/lib/api";

/** The card-facing identity fields. */
export type MiniatureNamedVideo = Pick<
  Video,
  "channel_display_name" | "channel_handle" | "author_display_name"
>;

/**
 * The name a video miniature credits: the channel name (display name, else
 * handle — today's behavior) unless the instance prefers the author display
 * name AND the payload carries one.
 */
export function miniatureDisplayName(
  video: MiniatureNamedVideo,
  preferAuthor: boolean,
): string {
  const channelName = video.channel_display_name || video.channel_handle || "";
  if (!preferAuthor) return channelName;
  return video.author_display_name || channelName;
}
