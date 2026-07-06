import type { VideoPrivacy } from "@/lib/api";

const DESCRIPTIONS: Record<Exclude<VideoPrivacy, "public">, string> = {
  private: "Only you can see this",
  unlisted: "Anyone with the link can see this; it is hidden from feeds and search",
};

// PrivacyBadge marks non-public content (videos, playlists) with an
// owner-facing "Private"/"Unlisted" badge; public content renders nothing.
// The one-line explanation travels as a title tooltip and as sr-only text so
// screen-reader users hear it too.
export function PrivacyBadge({ privacy }: { privacy: VideoPrivacy }) {
  if (privacy === "public") return null;
  const styles =
    privacy === "private" ? "bg-warning/15 text-warning" : "bg-surface-muted text-fg-muted";
  return (
    <span
      title={DESCRIPTIONS[privacy]}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {/* Minified inline lock / link icon */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {privacy === "private" ? (
          <path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
        ) : (
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        )}
      </svg>
      <span className="capitalize">{privacy}</span>
      <span className="sr-only"> — {DESCRIPTIONS[privacy]}</span>
    </span>
  );
}
