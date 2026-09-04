"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { WarningIcon } from "@/components/icons";
import { AddToPlaylistButton } from "@/components/AddToPlaylistButton";
import { CommentsSection } from "@/components/CommentsSection";
import type { DonateSource } from "@/components/SupportButton";
import { DownloadButton } from "@/components/DownloadButton";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { VideoPlayer, type CaptionTrack } from "@/components/player/VideoPlayer";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { RatingControls } from "@/components/RatingControls";
import { RelatedVideos } from "@/components/RelatedVideos";
import { ReportButton } from "@/components/ReportButton";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { SupportButton } from "@/components/SupportButton";
import { TimestampedText } from "@/components/TimestampedText";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { AmbientGlow } from "@/components/watch/AmbientGlow";
import { IpfsPlayerOverlay } from "@/components/watch/IpfsPlayerOverlay";
import { IpfsSourceBar, type IpfsSource } from "@/components/watch/IpfsSourceBar";
import { PasswordUnlockPanel } from "@/components/watch/PasswordUnlockPanel";
import { TranscodingNote } from "@/components/watch/TranscodingNote";
import { UpNextQueue } from "@/components/UpNextQueue";
import { WatchChannelCard } from "@/components/watch/WatchChannelCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { WatchSkeleton } from "@/components/watch/WatchSkeleton";
import {
  ApiError,
  api,
  ipfsHlsMasterUrl,
  isSensitiveVideo,
  videoCaptionUrl,
  videoThumbnailUrl,
} from "@/lib/api";
import {
  clearPlaybackToken,
  setPlaybackToken as storePlaybackToken,
} from "@/lib/api/playback-token-store";
import { getVideoConfigCached, resolveOptionLabel } from "@/lib/api/video-config";
import type { Channel, Video, VideoConfigResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { feedDefaultsForLanding, resolveLandingPage } from "@/lib/feed-defaults";
import { feedHref } from "@/lib/feed-url";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import { useInstanceDefaults } from "@/lib/instance-defaults";
import { logger } from "@/lib/logger";
import { readStoredTheater, serverTheater, subscribeTheater } from "@/lib/player-theater";
import { trackSearchEvent } from "@/lib/search-events";
import { useShortWatchUrl } from "@/lib/use-short-watch-url";
import { parseStartTime } from "@/lib/start-time";
import { useSensitiveContentPolicy } from "@/lib/use-sensitive-policy";
import { useRestrictedMode } from "@/lib/device-preferences";
import { dequeueVideo, useVideoQueue } from "@/lib/video-queue";

type Status = "loading" | "error" | "notfound" | "locked" | "ready";

// How often, at most, playback progress is reported to the backend while watching.
const PROGRESS_INTERVAL_MS = 10_000;
// Only offer to resume when the saved position is past this many seconds (skip
// trivial positions a viewer would not want to "resume" into).
const RESUME_MIN_SECONDS = 5;

// WatchView plays one video, starting from an anonymous server seed when the
// route could fetch one and revalidating it client-side. Private/password or
// backend-down server reads pass no seed and retain the client loading/unlock/
// retry path. For a signed-in viewer it records watch progress (so the video
// enters their history and can be resumed) and offers a Resume control from the
// saved position.
export function WatchView({
  id,
  code,
  initialVideo = null,
}: {
  /** The video's uuid, when the route knew it. */
  id?: string;
  /** The video's short code, when the page was reached as /v/{code}. */
  code?: string;
  initialVideo?: Video | null;
}) {
  // Exactly one of id/code names the video. `subject` is whichever the route
  // supplied: it keys the playback-token store and the navigated-away reset, so
  // both stay consistent within a page without caring which name was used.
  const subject = id ?? code ?? "";
  // The instance browse defaults (config-parity W5). The tag chips below link
  // to the recent feed filtered by tag; feedHref keeps ?sort= only when it
  // differs from the effective default, so the URL must be built against the
  // same landing-aware baseline the home page resolves with — otherwise a
  // non-recent default_feed_sort would silently reinterpret a bare /?tag=…
  // as the operator's default sort. null (defaults not landed / no backend)
  // reproduces the shipped recent/local baseline, i.e. the pre-W5 URLs.
  // Show the short share link in the address bar. Display only — the route,
  // and every URL the page's metadata advertises, stays /videos/{uuid}.
  useShortWatchUrl(id ?? "");
  const instanceDefaults = useInstanceDefaults();
  // The signed-in viewer, so the comments section can offer the creator
  // pin/heart controls when this is the video owner's own channel (owner-only
  // client gating; the server independently authorizes editors/moderators too).
  const { user } = useSession();
  const tagFeedDefaults = feedDefaultsForLanding(
    resolveLandingPage(instanceDefaults),
    instanceDefaults,
  );
  // The server seed belongs to this page only if it names the same video by the
  // same identifier the route carried; a mismatch means the seed is a previous
  // video's and must not paint.
  const seed =
    initialVideo !== null && (id !== undefined ? initialVideo.id === id : initialVideo.short_code === code)
      ? initialVideo
      : null;
  const [status, setStatus] = useState<Status>(seed ? "ready" : "loading");
  // The uuid a password_required 401 handed back, when the page was reached by
  // short code and therefore never had one.
  const [lockedVideoId, setLockedVideoId] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(seed);
  const [reloadKey, setReloadKey] = useState(0);
  // A minted, video-scoped playback token for a password-protected video
  // (CORE-17). Held in memory only (the module playback-token store + this state
  // for reactivity); NEVER persisted or logged. Threaded into the player so the
  // HLS/native/poster/caption/storyboard reads carry it, and dropped when the
  // viewer navigates away (the id-change reset + the unmount cleanup below).
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);
  // Theater mode (PLAY-04): a page-layout concern the player shell toggles. The
  // SSR snapshot is always off (serverTheater) so hydration matches; after
  // hydration the client restores the session's mode. Widens the stage to the
  // full content width and reflows the related rail below.
  const theater = useSyncExternalStore(subscribeTheater, readStoredTheater, serverTheater);
  // The "next" video for the player's autoplay end card (PLAY-08): the first
  // related entry, reported up by RelatedVideos so the end card reuses that fetch
  // (no second request). null until the rail resolves, or when nothing relates.
  const [relatedNextVideo, setRelatedNextVideo] = useState<Video | null>(null);
  const playbackQueue = useVideoQueue();
  // The player element, owned here so the Share dialog can read currentTime.
  const playerRef = useRef<HTMLVideoElement | null>(null);
  // Seek the player in place for a clicked timestamp (comment/description links).
  // The media element clamps currentTime to its own [0, duration]; the tokenizer
  // already bounds tokens to the known duration before they ever reach here.
  const seekToTimestamp = useCallback((seconds: number) => {
    const el = playerRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play?.().catch(() => {});
  }, []);
  // An explicit ?t=<seconds> start position from the URL, parsed once. The
  // <video> only renders after the client-side fetch resolves, so reading
  // window here cannot cause a hydration mismatch.
  const [startAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : parseStartTime(window.location.search),
  );
  // The discovery context this watch page was opened from (search-service W4):
  // a rail/result appends ?src=<home|related|search> so the play_started event
  // can report where the play came from. A non-PII marker parsed once (no query
  // text ever rides the URL); defaults to "watch" (a direct/bare visit).
  const [playSource] = useState<string>(() => {
    if (typeof window === "undefined") return "watch";
    const src = new URLSearchParams(window.location.search).get("src");
    return src && /^[a-z_]{1,16}$/.test(src) ? src : "watch";
  });
  const playStartedForRef = useRef<string | null>(null);
  // The metadata taxonomy for the category/language/license chips, loaded
  // (cached, once per page load) only when the video carries any of them.
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  // The owning channel's detail — fetched lazily to fill the channel row's
  // follower count and the Support sources' account scope (owner id). Absent
  // fields (a failed/pending read, or a remote video with no local channel)
  // degrade gracefully: the row omits the count, Support falls back to the
  // channel-scoped read alone. Never fabricated.
  const [channel, setChannel] = useState<Channel | null>(null);
  // Sensitive-content gate (spec: instance-platform-info.md): under the
  // effective blur/warn/hide policy (per-user override else instance) a
  // sensitive video's playback is held behind a confirmation scrim until the
  // viewer explicitly proceeds. `hide` normally drops flagged videos from
  // listings server-side, but a direct link can still reach this watch page, so
  // it is gated here too. `display` (or an absent policy) plays normally.
  const sensitivePolicy = useSensitiveContentPolicy();
  const restrictedMode = useRestrictedMode();
  const [sensitiveAccepted, setSensitiveAccepted] = useState(false);
  // IPFS playback surface (DR5): the video streams from the authoritative server
  // by default; a viewer can opt into the IPFS gateway mirror. "fetching" probes
  // the gateway HLS master; "ipfs" plays from it; "error" fell back to server.
  const [ipfsState, setIpfsState] = useState<IpfsSource>("server");
  const ipfsProbeRef = useRef<AbortController | null>(null);

  // A viewer-selected queue takes precedence over the automatic related pick.
  // Once a queued item becomes the current video it is consumed, preserving a
  // FIFO "play next" sequence across watch-page navigation and reloads.
  useEffect(() => {
    if (!video) return;
    dequeueVideo(video.id, video.remote === true);
  }, [video]);
  const queuedNextVideo = playbackQueue.find(
    (item) => !video || item.id !== video.id || Boolean(item.remote) !== Boolean(video.remote),
  );
  const nextVideo = queuedNextVideo ?? relatedNextVideo;

  // Content-addressed IPFS HLS master, present only when the detail carries a
  // pinned HLS CID + gateway AND the video has a transcoded ladder (IPFS
  // playback is HLS). Drives whether the source bar is offered at all.
  //
  // The `ipfs` object IS the detail's pinned signal — it is emitted only for a
  // public+published video whose ledger row is state='pinned' on the PUBLIC swarm.
  // This deliberately does NOT gate on `ipfs_pinned`: that flag is a CARD/FEED
  // field ("Drives the IPFS thumbnail badge on card/feed views"), set by the list
  // handlers only, and GET /videos/{id} never sends it — so requiring it here hid
  // the bar on every real backend while the mocked spec, which fabricated the
  // flag, stayed green. e2e-backed/ipfs.spec.ts is the live-mirror regression test.
  const ipfsMasterUrl = ipfsHlsMasterUrl(video?.ipfs);
  const ipfsAvailable = Boolean(ipfsMasterUrl && video?.hls_url);

  useEffect(() => {
    const controller = new AbortController();
    const fetchVideo =
      id !== undefined
        ? api.getVideo(id, playbackToken ?? undefined, controller.signal)
        : api.getVideoByCode(code ?? "", playbackToken ?? undefined, controller.signal);
    fetchVideo
      .then((v) => {
        setVideo(v);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // A password-protected video answers 401 password_required to a caller
        // without a valid credential — render the unlock prompt, not the generic
        // error state (a plain unknown id is still 404).
        if (err instanceof ApiError && err.status === 401 && err.code === "password_required") {
          setVideo(null);
          // Reached by short code there is no uuid yet, and the unlock POST is
          // keyed on one. Core puts it on this 401 for exactly that reason.
          if (err.videoId !== undefined) setLockedVideoId(err.videoId);
          setStatus("locked");
        } else if (err instanceof ApiError && err.status === 404) {
          setVideo(null);
          setStatus("notfound");
        } else if (!seed) {
          // A transient revalidation failure must not replace a usable public
          // server seed with an error screen. Unseeded reads keep the existing
          // retry surface.
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [id, code, reloadKey, playbackToken, seed]);

  // Emit video.play_started once per watched local video (search-service W4),
  // tagged with the discovery context this page was opened from. Best-effort
  // telemetry — the search service learns from it; core enforces attribution
  // policy. Remote videos are out of the local search corpus, so they are
  // skipped.
  useEffect(() => {
    if (!video || video.remote === true) return;
    if (playStartedForRef.current === video.id) return;
    playStartedForRef.current = video.id;
    trackSearchEvent({ type: "video.play_started", video_id: video.id, context: playSource });
  }, [video, playSource]);

  // On successful unlock: keep the token in the in-memory store + this state, and
  // drop to the loading state so the token-change refetch (the effect above)
  // repaints the player once the detail returns 200 with the token.
  const handleUnlocked = useCallback(
    (token: string) => {
      storePlaybackToken(subject, token);
      setPlaybackToken(token);
      setStatus("loading");
    },
    [subject],
  );

  // Navigating to another video drops the previous one's token: reset the state
  // (render-phase, so the refetch starts token-less) and clear the store entry
  // (unmount / id-change cleanup). A shared tab never carries an unlocked video forward.
  const [seenId, setSeenId] = useState(subject);
  if (seenId !== subject) {
    setSeenId(subject);
    if (playbackToken !== null) setPlaybackToken(null);
    // A sensitive-content confirmation never carries over to another video.
    if (sensitiveAccepted) setSensitiveAccepted(false);
  }
  useEffect(() => () => clearPlaybackToken(subject), [subject]);

  const hasTaxonomy = Boolean(video && (video.category || video.language || video.license));
  useEffect(() => {
    if (!hasTaxonomy) return;
    let cancelled = false;
    getVideoConfigCached()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Chips fall back to the raw taxonomy ids.
        if (!cancelled) setConfigFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasTaxonomy]);

  // Load the owning channel (for the follower count + Support account scope) once
  // the video resolves and carries a local channel handle. Fails silently.
  const channelHandleForFetch = video?.channel_handle ?? null;
  useEffect(() => {
    if (!channelHandleForFetch) return;
    const controller = new AbortController();
    api
      .getChannel(channelHandleForFetch, controller.signal)
      .then((c) => setChannel(c))
      .catch(() => {
        /* No follower count / account-scope source if the read fails. */
      });
    return () => controller.abort();
  }, [channelHandleForFetch]);

  // Reset the IPFS source + channel when navigating to another video (React's
  // "adjust state on prop change" render-phase pattern — the same component stays
  // mounted across /videos/[id] param changes, so an effect-time reset would lag a
  // frame). Tracked via state (not a ref) to satisfy the render-purity rules.
  const currentVideoId = video?.id ?? null;
  const [seenVideoId, setSeenVideoId] = useState(currentVideoId);
  if (seenVideoId !== currentVideoId) {
    setSeenVideoId(currentVideoId);
    setIpfsState("server");
    setChannel(null);
  }

  // Abort any in-flight IPFS probe when the video changes or the page unmounts.
  useEffect(
    () => () => {
      ipfsProbeRef.current?.abort();
      ipfsProbeRef.current = null;
    },
    [currentVideoId],
  );

  // Opt into IPFS: probe the gateway HLS master. A real fetch outcome — ok →
  // play from IPFS, not-ok/network error → the error state (peer-free copy).
  const tryIpfs = useCallback(() => {
    if (!ipfsMasterUrl) return;
    ipfsProbeRef.current?.abort();
    const controller = new AbortController();
    ipfsProbeRef.current = controller;
    setIpfsState("fetching");
    fetch(ipfsMasterUrl, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setIpfsState(res.ok ? "ipfs" : "error");
      })
      .catch(() => {
        if (!controller.signal.aborted) setIpfsState("error");
      });
  }, [ipfsMasterUrl]);

  const switchToServer = useCallback(() => {
    ipfsProbeRef.current?.abort();
    ipfsProbeRef.current = null;
    setIpfsState("server");
  }, []);

  const toggleSource = useCallback(() => {
    if (ipfsState === "ipfs" || ipfsState === "fetching") switchToServer();
    else tryIpfs();
  }, [ipfsState, switchToServer, tryIpfs]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  if (status === "loading") {
    // Same silhouette as the route loading boundary and the loaded page, so
    // navigation → hydration → data reads as one surface filling in.
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading video…</span>
        <WatchSkeleton />
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <EmptyState
        title="Video not found"
        message="This video does not exist, or it is private."
      />
    );
  }
  // Password-protected and not yet unlocked: the prompt stands in for the whole
  // watch surface (the detail — title, actions, comments — is gated behind it).
  if (status === "locked") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <PasswordUnlockPanel videoId={id ?? lockedVideoId ?? ""} onUnlocked={handleUnlocked} />
      </div>
    );
  }
  if (status === "error" || video === null) {
    return <ErrorState message="Could not load this video." onRetry={retry} />;
  }
  if (restrictedMode && isSensitiveVideo(video)) {
    return (
      <EmptyState
        title="Unavailable in Restricted Mode"
        message="Turn off Restricted Mode from your account menu to view sensitive content."
      />
    );
  }

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  // The detail response carries the owning channel's handle/display name (Wave A
  // contract) when it is a local video; a remote card has neither. Rendered as a
  // real channel row (avatar + name + followers + Follow) rather than muted text.
  const channelHandle = video.channel_handle ?? null;
  const channelName = video.channel_display_name || channelHandle || "";

  // Support (crypto donations) reads both the channel-scoped and, once the
  // channel detail resolves, the account-scoped public addresses — matching the
  // channel page's sources. The button self-hides when neither exposes any.
  const supportSources: DonateSource[] = channelHandle
    ? channel?.owner_id
      ? [
          { kind: "channel", handle: channelHandle },
          { kind: "user", userId: channel.owner_id },
        ]
      : [{ kind: "channel", handle: channelHandle }]
    : [];

  // Only stream from IPFS while it is the confirmed source; the server ladder
  // stays the fallback inside the player. Fetching/error paint the overlay.
  const hlsMasterOverride = ipfsState === "ipfs" ? ipfsMasterUrl : null;
  const playerOverlay =
    ipfsState === "fetching" || ipfsState === "error" ? (
      <IpfsPlayerOverlay
        state={ipfsState}
        onRefetch={tryIpfs}
        onUseServer={switchToServer}
      />
    ) : null;

  // Taxonomy chips only (category/language/license). Duration and pixel
  // dimensions are deliberately NOT chips: the player timeline already shows
  // duration and resolution lives in the quality menu — repeating them here as
  // metadata pills read as developer debris on the watch page.
  const chips: Array<{ key: string; label: string; sr?: string }> = [];
  // Taxonomy chips render once the (cached) config resolves the human labels —
  // or with the raw ids if the config fetch failed. Only shown when set.
  if (config !== null || configFailed) {
    if (video.category) {
      chips.push({
        key: "category",
        sr: "Category: ",
        label: resolveOptionLabel(config?.categories, video.category),
      });
    }
    if (video.language) {
      chips.push({
        key: "language",
        sr: "Language: ",
        label: resolveOptionLabel(config?.languages, video.language),
      });
    }
    if (video.license) {
      chips.push({
        key: "license",
        sr: "License: ",
        label: resolveOptionLabel(config?.licenses, video.license),
      });
    }
  }

  return (
    <div
      data-theater={theater ? "on" : "off"}
      className={cn(
        "flex flex-col gap-8",
        // Two-column at lg by default; theater collapses to a single full-width
        // column so the stage widens and the related rail reflows below.
        theater ? null : "lg:flex-row lg:items-start lg:gap-7",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-8">
      <article className="flex flex-col gap-4">
        <div className="flex flex-col">
          {isSensitiveVideo(video) &&
          !sensitiveAccepted &&
          (sensitivePolicy === "blur" ||
            sensitivePolicy === "warn" ||
            sensitivePolicy === "hide") ? (
            // Confirmation scrim (media-overlay exception: theme-invariant dark
            // stage in the player's slot) — playback only starts after an
            // explicit choice.
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-black px-6 text-center">
              <WarningIcon size={28} className="text-white/80" />
              <p className="text-sm font-semibold text-white">
                This video contains sensitive content
              </p>
              <p className="max-w-md text-[13px] text-white/70">
                The administrators of this instance flag such videos before playback.
              </p>
              {/* The creator's optional content-warning text, shown below the
                  generic line only when set. */}
              {video.sensitive_reason ? (
                <p className="max-w-md text-[13px] text-white/60">{video.sensitive_reason}</p>
              ) : null}
              <button
                type="button"
                onClick={() => setSensitiveAccepted(true)}
                className="focus-ring mt-1 inline-flex items-center rounded-[10px] bg-white px-4 py-2 text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
              >
                Watch anyway
              </button>
            </div>
          ) : (
            <>
              <Player
                video={video}
                videoRef={playerRef}
                startAt={startAt}
                nextVideo={nextVideo}
                hlsMasterOverride={hlsMasterOverride}
                playbackToken={playbackToken}
                overlay={playerOverlay}
              />
              {/* IPFS source bar — only when the video is gateway-mirrored. */}
              {ipfsAvailable ? (
                <IpfsSourceBar
                  state={ipfsState}
                  onToggle={toggleSource}
                  onRefetch={tryIpfs}
                />
              ) : null}
              {/* Still-transcoding note (publish-timing): shown while the detail
                  reports a live transcode job; self-removes once a poll says the
                  transcode finished. Keyed by id so navigation resets it. */}
              {video.transcoding === true ? (
                <TranscodingNote
                  key={video.id}
                  videoId={video.id}
                  playbackToken={playbackToken}
                />
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-balance text-title2 sm:text-title">{video.title}</h1>
          {/* views · age (+ owner-facing privacy badge). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-fg-muted">
            {/* Owner-facing badge: a private video only ever loads for its
                owner; an unlisted one tells anyone with the link how it is
                shared. Public renders nothing. */}
            <PrivacyBadge privacy={video.privacy ?? "public"} />
            {meta.length > 0 ? <span className="tabular-nums">{meta.join(" · ")}</span> : null}
          </div>
          {/* Channel row above the actions (YouTube order: title → channel →
              actions) — who made it before what you can do with it. */}
          {channelHandle ? (
            <WatchChannelCard
              handle={channelHandle}
              name={channelName}
              followerCount={channel?.follower_count ?? null}
              isFollowing={channel?.is_following ?? false}
              notificationSetting={channel?.notification_setting}
              onDelta={(d) =>
                setChannel((c) =>
                  c ? { ...c, follower_count: Math.max(0, c.follower_count + d) } : c,
                )
              }
            />
          ) : null}
          {/* Action row — Support (accent) leads, then the tonal pills; scrolls
              horizontally on a phone (design), wraps on desktop. */}
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-x-visible">
            {channelHandle ? (
              <SupportButton sources={supportSources} name={channelName || "this creator"} />
            ) : null}
            <RatingControls videoId={video.id} />
            <SaveButton videoId={video.id} />
            <AddToPlaylistButton videoId={video.id} />
            <ShareButton
              videoId={video.id}
              title={video.title}
              getCurrentTime={() => playerRef.current?.currentTime ?? 0}
            />
            <DownloadButton video={video} playbackToken={playbackToken} />
            <ReportButton kind="video" targetId={video.id} />
            <VideoActionsMenu video={video} onDeleted={() => window.location.assign("/")} />
          </div>
          {/* Secondary technical/taxonomy chips (duration, dimensions,
              category/language/license) on their own quiet row. */}
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-fg-muted"
                >
                  {c.sr ? <span className="sr-only">{c.sr}</span> : null}
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
          {video.tags && video.tags.length > 0 ? (
            <ul aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
              {video.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={feedHref("recent", { tag }, tagFeedDefaults)}
                    aria-label={`Browse videos tagged ${tag}`}
                    className="focus-ring inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                  >
                    #{tag}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {video.description ? (
            <p className="whitespace-pre-wrap rounded-2xl border border-border-subtle bg-surface p-4 text-subhead leading-relaxed text-fg shadow-soft">
              <TimestampedText
                text={video.description}
                durationSeconds={video.duration_seconds ?? null}
                onSeek={seekToTimestamp}
                keyPrefix="desc"
              />
            </p>
          ) : null}
        </div>
      </article>

      {/* comments_enabled is the server's EFFECTIVE value (instance toggle AND
          this video's comments_policy, config-parity W9); absent (older
          payloads) fails open — the server still gates posting. */}
      <CommentsSection
        videoId={video.id}
        commentsEnabled={video.comments_enabled !== false}
        durationSeconds={video.duration_seconds ?? null}
        onSeekToTimestamp={seekToTimestamp}
        canManageComments={Boolean(user && channel && user.id === channel.owner_id)}
      />
      </div>

      {/* Right rail: the viewer's up-next queue (renders nothing when empty)
          stacked above the related list. The wrapper takes no fixed width — each
          child carries the rail's lg width — so an empty queue + empty related
          leaves nothing occupying the column, preserving today's layout. */}
      <div className={cn("flex flex-col gap-4", theater ? null : "shrink-0")}>
        <UpNextQueue currentVideo={video} belowLayout={theater} />
        <RelatedVideos video={video} belowLayout={theater} onFirstRelated={setRelatedNextVideo} />
      </div>
    </div>
  );
}

// Player wraps the bespoke VideoPlayer shell with watch-history behaviour: for a
// signed-in viewer it reports playback position (throttled, plus on pause and
// unmount, via the shell's onPlay/onTimeUpdate/onPause hooks) and surfaces a
// Resume control loaded from the saved position. An explicit ?t=<seconds> start
// (startAt) is honoured via a media-fragment `#t=` on the stream src (or hls.js
// startPosition) — and suppresses the resume offer (the explicit link intent
// wins). Caption tracks are fetched here and handed to the shell as same-origin
// blob URLs (the cross-origin-safe technique that preserves Range streaming).
function Player({
  video,
  videoRef,
  startAt,
  nextVideo,
  hlsMasterOverride,
  playbackToken,
  overlay,
}: {
  video: Video;
  videoRef: RefObject<HTMLVideoElement | null>;
  startAt: number | null;
  nextVideo: Video | null;
  hlsMasterOverride: string | null;
  playbackToken: string | null;
  overlay: ReactNode;
}) {
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authed";
  const lastSentRef = useRef(0);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [tracks, setTracks] = useState<CaptionTrack[]>([]);

  // Report the current position (whole seconds). No-op unless signed in.
  const record = useCallback(() => {
    const el = videoRef.current;
    if (!authed || !el) return;
    const pos = Math.floor(el.currentTime || 0);
    void api.recordWatchProgress(video.id, pos).catch(() => {});
  }, [authed, video.id, videoRef]);

  // Throttled variant for the high-frequency timeupdate/play events.
  const recordThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < PROGRESS_INTERVAL_MS) return;
    lastSentRef.current = now;
    record();
  }, [record]);

  // Count a view exactly once per loaded video, on the player's first play
  // signal. The play event fires for HLS and original-file playback alike (both
  // surface through the shell's onPlay), so hooking it here covers every source.
  // The backend (optional auth) owns dedup and no-ops for a non-published video,
  // so this fires for signed-out viewers too and needs no client-side threshold.
  // Keyed by video id so navigating to another video re-arms it, while a
  // pause/replay/seek of the same video never re-fires.
  const viewCountedForRef = useRef<string | null>(null);
  const handlePlay = useCallback(() => {
    if (viewCountedForRef.current !== video.id) {
      viewCountedForRef.current = video.id;
      // Fire-and-forget: a failed view count is best-effort telemetry the viewer
      // must never see; log it quietly for diagnostics only.
      void api.recordVideoView(video.id).catch((err: unknown) => {
        logger.debug("failed to record video view", { video_id: video.id, error: String(err) });
      });
    }
    recordThrottled();
  }, [video.id, recordThrottled]);

  // Load the saved resume position once (signed in only, and not when the URL
  // carries an explicit ?t= start).
  useEffect(() => {
    if (!authed || startAt !== null) return;
    const controller = new AbortController();
    api
      .getWatchProgress(video.id, controller.signal)
      .then((p) => {
        if (p.position_seconds >= RESUME_MIN_SECONDS) setResumeAt(p.position_seconds);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [authed, video.id, startAt]);

  // Flush the final position when leaving the page / switching videos.
  useEffect(() => {
    return () => record();
  }, [record]);

  // Load the video's caption tracks and expose each WebVTT body as a same-origin
  // blob URL. Fetching the text ourselves (rather than pointing <track src> at the
  // cross-origin backend) sidesteps the native cross-origin track restriction — no
  // `crossorigin` on the media element, so the Range-based stream is untouched.
  // Captions are small; loading them up front is cheap and revoked on cleanup.
  useEffect(() => {
    const controller = new AbortController();
    const created: string[] = [];
    let cancelled = false;
    api
      .getCaptions(video.id, controller.signal)
      .then(async ({ captions }) => {
        const loaded: Array<{ language: string; label: string; url: string }> = [];
        for (const c of captions) {
          try {
            const res = await fetch(videoCaptionUrl(video.id, c.language, playbackToken), {
              signal: controller.signal,
            });
            if (!res.ok) continue;
            const url = URL.createObjectURL(
              new Blob([await res.text()], { type: "text/vtt" }),
            );
            created.push(url);
            loaded.push({ language: c.language, label: c.label || c.language, url });
          } catch {
            // Skip a track that fails to load; the others still work.
          }
        }
        if (!cancelled) setTracks(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [video.id, playbackToken]);

  function resume() {
    const el = videoRef.current;
    if (el && resumeAt !== null) {
      el.currentTime = resumeAt;
      void el.play().catch(() => {});
    }
    setResumeAt(null);
  }

  // Ambient glow (Watch signature): a blurred copy of the poster bleeds behind
  // the player for a soft halo (see AmbientGlow). Absent when the video has no
  // thumbnail — there is no imagery to bloom from.
  const posterUrl = video.has_thumbnail ? videoThumbnailUrl(video.id, playbackToken) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative isolate">
        <AmbientGlow posterUrl={posterUrl} />
        <VideoPlayer
          video={video}
          videoRef={videoRef}
          startAt={startAt}
          tracks={tracks}
          nextVideo={nextVideo}
          hlsMasterOverride={hlsMasterOverride}
          playbackToken={playbackToken}
          overlay={overlay}
          onPlay={handlePlay}
          onTimeUpdate={recordThrottled}
          onPause={record}
        />
      </div>
      {/* Quiet under-player row: Resume (when known) left, the shortcuts
          disclosure ghosted right. The whole row disappears on touch-size
          screens when Resume is absent — keyboard help means nothing there. */}
      <div
        className={cn(
          resumeAt !== null ? "flex" : "hidden sm:flex",
          "flex-wrap items-center gap-2",
        )}
      >
        {resumeAt !== null ? (
          <button
            type="button"
            onClick={resume}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-surface-muted px-4 py-2 text-[13px] font-semibold tabular-nums text-fg transition-colors hover:bg-surface-strong"
          >
            Resume from {formatDuration(resumeAt)}
          </button>
        ) : null}
        <div className="ml-auto hidden sm:block">
          <KeyboardShortcutsHelp />
        </div>
      </div>
    </div>
  );
}
