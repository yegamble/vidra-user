"use client";

import {
  isSensitiveVideo,
  remoteVideoThumbnailUrl,
  videoOriginalUrl,
  videoThumbnailUrl,
  type Video,
} from "@/lib/api";
import { useRestrictedMode } from "@/lib/device-preferences";
import { useInstanceFeatures } from "@/lib/instance-features";
import { usePlayerSettings } from "@/lib/player-settings";
import { useSensitiveContentPolicy } from "@/lib/use-sensitive-policy";

export type VideoCardPresentation = {
  /** A federated remote card: remote watch route, cached remote poster, no local channel route. */
  isRemote: boolean;
  /** Where the thumbnail and title link. */
  watchHref: string;
  /** The owner flagged the video as sensitive. */
  sensitive: boolean;
  /**
   * Restricted Mode is on AND the video is sensitive — the card must render its
   * RestrictedModePlaceholder instead of the tile (see components/RestrictedModePlaceholder).
   */
  restrictedHidden: boolean;
  /** Instance/user policy is `blur`: blur + badge the poster (and suppress the preview). */
  blurSensitive: boolean;
  /** Policy is `blur` or `warn`: show the "Sensitive" badge. */
  markSensitive: boolean;
  /** Hover-preview policy for this card (see below). */
  previewEligible: boolean;
  /** The hover-preview media source, or null when the card must stay a plain thumbnail. */
  previewSrc: string | null;
  /** The poster image, or null when the payload reports no thumbnail. */
  posterSrc: string | null;
  /** Whole-second duration, or null when unknown or below one second. */
  duration: number | null;
};

export type VideoCardPresentationOptions = {
  /**
   * Set on lists that can only ever carry this instance's OWN videos (the
   * channel grid): the caller has already established locality, so the remote
   * branch is skipped rather than re-derived from the payload. Equivalent to
   * `video.remote !== true` for every value such a list can hold — it exists so
   * the channel card shares this hook instead of forking it.
   */
  localOnly?: boolean;
  /**
   * Appended to the LOCAL watch href (e.g. "?src=related" so the watch page can
   * attribute the play to the up-next rail). Never appended to the remote href,
   * which points at a different surface.
   */
  localWatchQuery?: string;
};

/**
 * useVideoCardPresentation resolves the presentation policy every video tile
 * shares: federation (local vs remote route + poster), the sensitive-content
 * treatment (spec: instance-platform-info.md), Restricted Mode, and hover-preview
 * eligibility. Six surfaces (feed card, channel card, history rail, library row,
 * search row, up-next row) had this same block copy-pasted; they now differ only
 * in markup and geometry.
 *
 * Sensitive presentation: under the effective `blur` policy a sensitive video's
 * poster is blurred and badged; under `warn` it is badged only; `display` (and
 * `hide`, which is enforced server-side, or an unknown policy) applies no client
 * treatment. Restricted Mode hides the tile outright.
 *
 * The preview is deliberately local-only: a federated stream_url may be HLS and
 * requires the remote hls.js pipeline rather than a raw media src, and
 * private/password media needs a video-scoped credential a card does not hold.
 * Both cases remain normal thumbnail links.
 *
 * Callers keep `hasStoryboard={false}` on VideoCardPreview: card/feed payloads
 * carry no has_storyboard flag, so a card cannot know whether one exists and must
 * not guess — passing the eligibility policy instead made every hover on an
 * eligible card fetch a storyboard.vtt that 404s for any video that never had one
 * generated. The hover scrubber shows timestamps only; the real storyboard belongs
 * to the watch page, whose detail payload carries the true flag.
 */
export function useVideoCardPresentation(
  video: Video,
  options: VideoCardPresentationOptions = {},
): VideoCardPresentation {
  const previewFeatureEnabled = useInstanceFeatures()?.video_card_previews === true;
  const previewPreferenceEnabled = usePlayerSettings().video_card_previews_enabled;
  const policy = useSensitiveContentPolicy();
  const restrictedMode = useRestrictedMode();

  const isRemote = options.localOnly === true ? false : video.remote === true;
  const watchHref = isRemote
    ? `/remote/${video.id}`
    : `/videos/${video.id}${options.localWatchQuery ?? ""}`;

  const sensitive = isSensitiveVideo(video);
  const blurSensitive = sensitive && policy === "blur";
  const markSensitive = sensitive && (policy === "blur" || policy === "warn");

  const previewEligible =
    previewFeatureEnabled &&
    previewPreferenceEnabled &&
    !isRemote &&
    video.state === "published" &&
    video.privacy !== "private" &&
    video.privacy !== "password" &&
    !blurSensitive;

  // > 0 guard: a sub-second clip probes to 0 whole seconds, and a "0:00" badge is
  // noise rather than information.
  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;

  return {
    isRemote,
    watchHref,
    sensitive,
    restrictedHidden: sensitive && restrictedMode,
    blurSensitive,
    markSensitive,
    previewEligible,
    previewSrc: previewEligible ? videoOriginalUrl(video.id) : null,
    posterSrc: video.has_thumbnail
      ? isRemote
        ? remoteVideoThumbnailUrl(video.id)
        : videoThumbnailUrl(video.id)
      : null,
    duration,
  };
}
