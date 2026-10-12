import type { VideoPrivacy } from "@/lib/api";

/**
 * The privacy choices a creator picks from when publishing or editing a video —
 * one list, so the upload form, the batch queue and the Studio editor cannot
 * drift apart. "password" is deliberately absent: a password video needs a
 * password first, so only the editor that can set one appends it.
 *
 * "internal" is PeerTube's members-only tier: anyone signed in to THIS instance
 * can watch it, nobody anonymous can, and it never federates.
 */
export const VIDEO_PRIVACY_CHOICES: readonly { value: VideoPrivacy; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "internal", label: "Internal (signed-in users only)" },
  { value: "private", label: "Private" },
];

/**
 * isSignInRequired reports whether a video read was refused only because the
 * viewer is anonymous: core answers 401 `sign_in_required` for an internal
 * video. Duck-typed on the error envelope's status + code so it holds for any
 * ApiError instance.
 */
export function isSignInRequired(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { status, code } = err as { status?: unknown; code?: unknown };
  return status === 401 && code === "sign_in_required";
}
