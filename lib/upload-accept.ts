// File-picker `accept` values for the studio's upload and replace flows,
// kept in lock-step with the server's extension gate (config-parity W10/W14:
// upload_additional_extensions_enabled). The server is the enforcement truth
// (415 unsupported_media_type either way); this only makes the OS picker
// honest so users are not offered files the upload would refuse.

/** The always-accepted base containers (vidra-core's baseVideoExts). */
export const BASE_VIDEO_ACCEPT = ".mp4,.webm,.ogv,.ogg,video/mp4,video/webm,video/ogg";

/**
 * videoAcceptAttr maps the /instance features.upload_additional_extensions
 * flag to the file input's accept attribute: while the extended container set
 * is accepted (or the flag is unknown — an older backend, a failed fetch —
 * fail open like the rest of the form), any video/* file may be picked;
 * once an admin turns the extended set off, the picker narrows to the base
 * containers the server will actually take.
 */
export function videoAcceptAttr(additionalExtensions: boolean | undefined | null): string {
  return additionalExtensions === false ? BASE_VIDEO_ACCEPT : "video/*";
}

// The base container extensions the server always takes (mirrors BASE_VIDEO_ACCEPT).
const BASE_VIDEO_EXTS = [".mp4", ".webm", ".ogv", ".ogg"];
const BASE_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"];

/**
 * isAcceptedVideoFile decides whether a dropped file should be routed into the
 * upload flow, honoring the SAME extension gate as videoAcceptAttr. Real
 * drag-and-drop bypasses the file input's `accept` filter (which only applies to
 * the OS picker), so a manual check keeps the dropzone from swallowing a
 * non-video the server would just 415. With the extended set on/unknown any
 * video/* MIME (or a video-ish extension when the OS gives no type) passes; once
 * an admin narrows to the base containers, only those are accepted client-side.
 */
export function isAcceptedVideoFile(
  file: { name: string; type: string },
  additionalExtensions: boolean | undefined | null,
): boolean {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (additionalExtensions === false) {
    return BASE_VIDEO_TYPES.includes(type) || BASE_VIDEO_EXTS.some((e) => name.endsWith(e));
  }
  // Permissive (matches the "video/*" accept): trust an explicit video MIME, or
  // fall back to a common video extension when the OS reports no type.
  if (type.startsWith("video/")) return true;
  if (type !== "") return false;
  return /\.(mp4|webm|ogv|ogg|mov|mkv|avi|m4v|flv|wmv|mpg|mpeg|3gp)$/i.test(name);
}
