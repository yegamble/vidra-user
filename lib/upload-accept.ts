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
