// Video-miniature attribution naming (config-parity W5:
// miniature_prefer_author_display_name). When the operator turns the flag on,
// cards credit the UPLOADER ACCOUNT's display name instead of the channel's.
//
// PAYLOAD GAP (recorded W5 deviation): the public feed/search video payloads
// carry only channel identity today (channel_display_name/channel_handle) —
// no uploader account display name. The resolver therefore consumes an
// OPTIONAL `author_display_name` field (typed locally below; vidra-core adds
// it in a follow-up) and falls back to the channel name while it is absent,
// so this frontend is already complete the moment the backend field lands.

import type { Video } from "@/lib/api";

/** The card-facing identity fields, plus the pending backend follow-up field. */
export type MiniatureNamedVideo = Pick<
  Video,
  "channel_display_name" | "channel_handle"
> & {
  /** The uploader account's display name — not sent by vidra-core yet (see above). */
  author_display_name?: string;
};

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
