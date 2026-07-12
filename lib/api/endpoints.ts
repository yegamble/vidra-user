import { apiBaseUrl } from "@/lib/config";

import { getAccessToken } from "./auth-store";
import { ApiError, apiRequest } from "./client";
import { uploadWithProgress, type UploadProgress } from "./upload";
import type {
  AdminCommentListResponse,
  AdminStats,
  AdminUser,
  AdminUserListResponse,
  AuditLogListResponse,
  InstanceDocument,
  InstanceDocumentName,
  InstanceSettingsResponse,
  UpdateInstanceSettingsRequest,
  InstanceAboutResponse,
  InstanceContactRequest,
  JobsOverview,
  JobRunDetailResponse,
  JobRunsResponse,
  JobRunState,
  MediaGCResponse,
  PeerTubeImportLaunchRequest,
  PeerTubeImportRun,
  PeerTubeImportRunList,
  SystemStatus,
  AdminVideoListResponse,
  BlockedRemoteVideoListResponse,
  BlockedVideoListResponse,
  BlockVideoRequest,
  Caption,
  CaptionListResponse,
  Channel,
  ChannelListResponse,
  ChannelSyncListResponse,
  ChannelSyncResponse,
  CreateChannelSyncRequest,
  FederationFollowerRequestListResponse,
  FollowedChannelsResponse,
  AddDonationAddressRequest,
  DonationAddress,
  DonationAddressListResponse,
  DonationChallengeResponse,
  VerifyDonationAddressRequest,
  Comment,
  CommentListResponse,
  BlockedUserListResponse,
  Conversation,
  ConversationListResponse,
  E2EEClaimResponse,
  E2EEDevice,
  E2EEDeviceListResponse,
  E2EEOneTimeKey,
  EncryptedMessageListResponse,
  OneTimeKeyCountResponse,
  RegisterE2EEDeviceRequest,
  SendEncryptedMessageRequest,
  SendEncryptedResponse,
  UploadOneTimeKeysResponse,
  AutoCaptionRequest,
  CaptionJobResponse,
  CreateLiveStreamRequest,
  CreateLiveStreamResponse,
  LiveStream,
  LiveStreamListResponse,
  LiveStreamKey,
  LivePublicListResponse,
  UpdateLiveStreamRequest,
  MessageListResponse,
  Message,
  UploadAttachmentResponse,
  MutedAccountListResponse,
  MutedInstanceListResponse,
  BlockInstanceRequest,
  BlockedInstanceListResponse,
  CreateRemoteFollowRequest,
  RemoteFollow,
  RemoteFollowListResponse,
  ATProtoLinkRequest,
  ATProtoStatus,
  RemoteVideo,
  FeedScope,
  CreateChannelRequest,
  UpdateChannelRequest,
  CreateVideoRequest,
  FeedSort,
  InstanceResponse,
  RatingValue,
  Video,
  VideoChapters,
  SetVideoChaptersRequest,
  UnlockVideoResponse,
  VideoPassword,
  VideoPasswords,
  EmbedPrivacy,
  VideoConfigResponse,
  VideoFeedResponse,
  VideoListResponse,
  VideoDownloadResponse,
  ChannelStatsResponse,
  QuotaStatus,
  CreatePlaylistRequest,
  NotificationListResponse,
  NotificationPrefsResponse,
  PlayerSettings,
  UpdatePlayerSettingsRequest,
  Playlist,
  QuarantinedVideoListResponse,
  RejectQuarantinedVideoRequest,
  PlaylistDetail,
  PlaylistListResponse,
  ProfileImage,
  RegistrationRequestListResponse,
  RejectRegistrationRequest,
  ReportListResponse,
  ResolveReportRequest,
  UnreadCountResponse,
  UpdateUserRequest,
  UpdatePlaylistRequest,
  UpdateVideoRequest,
  UploadVideoResult,
  CreateUploadSessionRequest,
  UploadSessionResponse,
  UploadStatusResponse,
  ActiveUploadsResponse,
  ImportJobResponse,
  ImportResolver,
  VideoFile,
  VideoRating,
  VideoStatsResponse,
  VideoSearchResponse,
  WatchedWord,
  WatchedWordListResponse,
  WatchedWordMatchListResponse,
  WatchHistoryResponse,
  WatchProgress,
} from "./types";

/**
 * The typed instance logo slots (config-parity W4; PeerTube LogoType parity).
 * The path-segment values of POST/DELETE /api/v1/admin/instance-logo/{type}.
 */
export type InstanceLogoType = "favicon" | "header-wide" | "header-square" | "opengraph";

export interface FeedParams {
  sort?: FeedSort;
  /**
   * Feed scope: "local" (default) or "all", which mixes in federated remote
   * videos (remote:true cards). Omitted → the backend defaults to local.
   */
  scope?: FeedScope;
  /** Only videos carrying this free-form tag (case-insensitive exact match). */
  tag?: string;
  /** Only videos with this subject-category id (GET /videos/config; unknown → 422). */
  category?: string;
  /** Only videos with this content-language code (GET /videos/config; unknown → 422). */
  language?: string;
  limit?: number;
  offset?: number;
}

export interface SearchParams {
  limit?: number;
  offset?: number;
}

/**
 * Params for GET /videos/search: pagination plus the optional taxonomy/tag
 * filters the search page mirrors from the home feed (category/language ids come
 * from GET /videos/config; tag is a free-form lowercased tag). Each filter
 * narrows to LOCAL results (federated remote cards are excluded when set).
 */
export interface SearchVideosParams extends SearchParams {
  tag?: string;
  category?: string;
  language?: string;
}

export interface JobRunListParams {
  state?: JobRunState;
  type?: string;
  queue?: string;
  resourceType?: string;
  resourceId?: string;
  workerId?: string;
  /** true = failed/dead-lettered only; omitted = any outcome. */
  failure?: true;
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}

/** Typed wrappers for the public vidra-core read endpoints. */
export const api = {
  /** GET /api/v1/instance — public instance about/config. */
  getInstance: (signal?: AbortSignal) =>
    apiRequest<InstanceResponse>("/api/v1/instance", { signal }),

  /** GET /api/v1/instance/about — public raw-markdown instance information. */
  getInstanceAbout: (signal?: AbortSignal) =>
    apiRequest<InstanceAboutResponse>("/api/v1/instance/about", { signal }),

  /** POST /api/v1/instance/contact — public visitor message to the administrators. */
  contactInstance: (body: InstanceContactRequest) =>
    apiRequest<void>("/api/v1/instance/contact", { method: "POST", body }),

  /**
   * GET /api/v1/videos — public feed, ordered by sort, with view/thumbnail
   * cards. Optional tag/category/language filters narrow the feed (unknown
   * category/language ids are a 422).
   */
  getFeed: (params: FeedParams = {}, signal?: AbortSignal) =>
    apiRequest<VideoFeedResponse>("/api/v1/videos", {
      query: {
        sort: params.sort,
        scope: params.scope,
        tag: params.tag,
        category: params.category,
        language: params.language,
        limit: params.limit,
        offset: params.offset,
      },
      signal,
    }),

  /** GET /api/v1/videos/config — static metadata taxonomy for the studio dropdowns. */
  getVideoConfig: (signal?: AbortSignal) =>
    apiRequest<VideoConfigResponse>("/api/v1/videos/config", { signal }),

  /** GET /api/v1/videos/{id} — video detail (private → owner only, else 404). */
  getVideo: (id: string, token?: string, signal?: AbortSignal) =>
    apiRequest<Video>(`/api/v1/videos/${encodeURIComponent(id)}`, { token, signal }),

  /**
   * GET /api/v1/videos/{id}/download — the currently available downloadable
   * originals, progressive transcodes, HLS-quality MP4s, audio and subtitles.
   * The server applies the instance download policy and role bypass rules.
   */
  getVideoDownloads: (id: string, token?: string, signal?: AbortSignal) =>
    apiRequest<VideoDownloadResponse>(
      `/api/v1/videos/${encodeURIComponent(id)}/download`,
      { token, signal },
    ),

  /**
   * Fetch one attachment URL returned by getVideoDownloads. The strict prefix
   * check keeps a compromised response from turning this helper into an
   * authenticated cross-endpoint request.
   */
  fetchVideoDownload: async (
    id: string,
    path: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<Blob> => {
    const prefix = `/api/v1/videos/${encodeURIComponent(id)}/download/`;
    if (!path.startsWith(prefix) || path.includes("..")) {
      throw new ApiError({
        status: 0,
        code: "invalid_download_url",
        message: "the server returned an invalid download URL",
      });
    }
    const bearer = token ?? getAccessToken();
    const res = await fetch(`${apiBaseUrl}${path}`, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      signal,
    });
    if (!res.ok) {
      throw new ApiError({
        status: res.status,
        code: "download_unavailable",
        message: "this download is no longer available",
      });
    }
    return res.blob();
  },

  /**
   * GET /api/v1/videos/search?q= — public title/tag search. Optional taxonomy/tag
   * filters (category/language/tag) narrow results to local videos; an unknown
   * category/language value is a 422 (the selects are populated from the same
   * GET /videos/config taxonomy, so the UI never sends one).
   */
  searchVideos: (query: string, params: SearchVideosParams = {}, signal?: AbortSignal) =>
    apiRequest<VideoSearchResponse>("/api/v1/videos/search", {
      query: {
        q: query,
        limit: params.limit,
        offset: params.offset,
        tag: params.tag,
        category: params.category,
        language: params.language,
      },
      signal,
    }),

  /** GET /api/v1/channels/{handle} — channel by handle. */
  getChannel: (handle: string, signal?: AbortSignal) =>
    apiRequest<Channel>(`/api/v1/channels/${encodeURIComponent(handle)}`, { signal }),

  /** GET /api/v1/channels/{handle}/videos — a channel's videos (cards). */
  listChannelVideos: (handle: string, token?: string, signal?: AbortSignal) =>
    apiRequest<VideoListResponse>(
      `/api/v1/channels/${encodeURIComponent(handle)}/videos`,
      { token, signal },
    ),

  /**
   * GET /api/v1/videos/{id}/stats — creator statistics for a video (auth, owner
   * only; a non-owner/unknown id is 404 so existence is not leaked).
   */
  getVideoStats: (id: string, signal?: AbortSignal) =>
    apiRequest<VideoStatsResponse>(`/api/v1/videos/${encodeURIComponent(id)}/stats`, { signal }),

  /**
   * GET /api/v1/channels/{handle}/stats — aggregated creator statistics for a
   * channel (auth, owner only; a non-owner/unknown handle is 404).
   */
  getChannelStats: (handle: string, signal?: AbortSignal) =>
    apiRequest<ChannelStatsResponse>(
      `/api/v1/channels/${encodeURIComponent(handle)}/stats`,
      { signal },
    ),

  /** POST /api/v1/channels/{handle}/follow — follow a channel (auth; idempotent 204). */
  followChannel: (handle: string) =>
    apiRequest<void>(`/api/v1/channels/${encodeURIComponent(handle)}/follow`, { method: "POST" }),

  /** DELETE /api/v1/channels/{handle}/follow — unfollow a channel (auth; idempotent 204). */
  unfollowChannel: (handle: string) =>
    apiRequest<void>(`/api/v1/channels/${encodeURIComponent(handle)}/follow`, { method: "DELETE" }),

  /** GET /api/v1/me/channels — the caller's own channels (auth). */
  getMyChannels: (signal?: AbortSignal) =>
    apiRequest<ChannelListResponse>("/api/v1/me/channels", { signal }),

  /**
   * GET /api/v1/me/quota — the caller's storage usage + effective quota (auth):
   * used_bytes and quota_bytes (null = unlimited). Drives the Studio storage card.
   */
  getMyQuota: (signal?: AbortSignal) =>
    apiRequest<QuotaStatus>("/api/v1/me/quota", { signal }),

  /**
   * GET /api/v1/me/player-settings — the caller's effective player defaults
   * (PLAY-07, auth): autoplay_next, default_speed, default_quality,
   * captions_default, theater_default. Always 200 with the full object (a user
   * who never saved gets the built-in defaults). The bespoke player hydrates
   * from this on the watch page; the settings surface edits it.
   */
  getPlayerSettings: (signal?: AbortSignal) =>
    apiRequest<PlayerSettings>("/api/v1/me/player-settings", { signal }),

  /**
   * PUT /api/v1/me/player-settings — MERGE update (auth): send only the changed
   * field(s); omitted fields keep their stored value. Returns the full effective
   * object after the merge. 400 on an invalid default_speed (off the shared
   * ladder) or default_quality (not "auto" / not a rendition height).
   */
  updatePlayerSettings: (patch: UpdatePlayerSettingsRequest) =>
    apiRequest<PlayerSettings>("/api/v1/me/player-settings", {
      method: "PUT",
      body: patch,
    }),

  // --- Donation addresses (P13, NON-CUSTODIAL display-only) ---------------
  // Vidra never holds funds, balances, or private keys and processes no
  // payments/payouts. These wrappers only add/read/delete public addresses and
  // drive the ownership challenge/verify proof (no key material is handled).

  /** GET /api/v1/me/donation-addresses — the caller's addresses (account + channel), each with its verified flag (auth). */
  listMyDonationAddresses: (signal?: AbortSignal) =>
    apiRequest<DonationAddressListResponse>("/api/v1/me/donation-addresses", { signal }),

  /**
   * POST /api/v1/me/donation-addresses — add a public donation address (auth).
   * Unsupported network / malformed address is 422; a duplicate for the same
   * owner/scope is 409; an unowned/absent channel_id is 403/404.
   */
  addDonationAddress: (body: AddDonationAddressRequest) =>
    apiRequest<DonationAddress>("/api/v1/me/donation-addresses", { method: "POST", body }),

  /** DELETE /api/v1/me/donation-addresses/{id} — remove one of the caller's addresses (auth, owner; 204). */
  deleteDonationAddress: (id: string) =>
    apiRequest<void>(`/api/v1/me/donation-addresses/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  /**
   * POST /api/v1/me/donation-addresses/{id}/challenge — request a one-time
   * message to sign to prove control (auth, owner). Networks without a signing
   * path (bitcoin/litecoin/monero) return 501 (unverified-only).
   */
  challengeDonationAddress: (id: string) =>
    apiRequest<DonationChallengeResponse>(
      `/api/v1/me/donation-addresses/${encodeURIComponent(id)}/challenge`,
      { method: "POST" },
    ),

  /**
   * POST /api/v1/me/donation-addresses/{id}/verify — submit the challenge
   * signature (auth, owner). On success the address flips to verified. A wrong
   * signature is 422; an expired/missing challenge is 409; an unsupported
   * network is 501. The signature is verified, never stored or logged.
   */
  verifyDonationAddress: (id: string, body: VerifyDonationAddressRequest) =>
    apiRequest<DonationAddress>(
      `/api/v1/me/donation-addresses/${encodeURIComponent(id)}/verify`,
      { method: "POST", body },
    ),

  /** GET /api/v1/users/{id}/donation-addresses — a user's PUBLIC account-level addresses (no auth). */
  listUserDonationAddresses: (userId: string, signal?: AbortSignal) =>
    apiRequest<DonationAddressListResponse>(
      `/api/v1/users/${encodeURIComponent(userId)}/donation-addresses`,
      { signal },
    ),

  /** GET /api/v1/channels/{handle}/donation-addresses — a channel's PUBLIC addresses (no auth; unknown handle 404). */
  listChannelDonationAddresses: (handle: string, signal?: AbortSignal) =>
    apiRequest<DonationAddressListResponse>(
      `/api/v1/channels/${encodeURIComponent(handle)}/donation-addresses`,
      { signal },
    ),

  /** POST /api/v1/channels — create a channel (auth). */
  createChannel: (body: CreateChannelRequest) =>
    apiRequest<Channel>("/api/v1/channels", { method: "POST", body }),

  /** PATCH /api/v1/channels/{handle} — update a channel's name/description (auth, owner). */
  updateChannel: (handle: string, body: UpdateChannelRequest) =>
    apiRequest<Channel>(`/api/v1/channels/${encodeURIComponent(handle)}`, { method: "PATCH", body }),

  /** DELETE /api/v1/channels/{handle} — delete a channel and its videos (auth, owner; 204). */
  deleteChannel: (handle: string) =>
    apiRequest<void>(`/api/v1/channels/${encodeURIComponent(handle)}`, { method: "DELETE" }),

  /**
   * GET /api/v1/channel-syncs — the caller's channel auto-syncs, newest first
   * (UPLOAD-13, backport W2.U5). Each carries its state (waiting_first_run |
   * syncing | idle | failed), last_sync_at, and a safe last_error. Always 200
   * for an authed caller — the feature-off 503 lives on create/sync-now, so an
   * existing sync stays visible for management even when the feature is toggled off.
   */
  listChannelSyncs: (signal?: AbortSignal) =>
    apiRequest<ChannelSyncListResponse>("/api/v1/channel-syncs", { signal }),

  /**
   * POST /api/v1/channel-syncs — bind a LOCAL channel you own to an external
   * platform channel URL so a periodic worker mirrors its recent uploads into
   * yours as PRIVATE drafts (auth, owner). The external URL is SSRF-validated.
   * Typed failures the caller surfaces: 422 (malformed/non-public URL, or the
   * per-user sync cap), 409 (an identical (channel, URL) sync already exists),
   * 404 (no such owned channel), 503 `service_unavailable` (auto-sync is off on
   * this instance) → the honest disabled empty state.
   */
  createChannelSync: (body: CreateChannelSyncRequest) =>
    apiRequest<ChannelSyncResponse>("/api/v1/channel-syncs", { method: "POST", body }),

  /** DELETE /api/v1/channel-syncs/{id} — remove an owned channel sync (auth; 204). */
  deleteChannelSync: (id: string) =>
    apiRequest<void>(`/api/v1/channel-syncs/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * POST /api/v1/channel-syncs/{id}/sync-now — schedule an owned sync to run on
   * the next worker tick, a manual refresh between cadence runs (auth; 202). It
   * does NOT sync synchronously — the list refetch reflects the state change.
   * 503 when the feature is off, 404 when the sync is unknown/not owned.
   */
  syncChannelNow: (id: string) =>
    apiRequest<void>(`/api/v1/channel-syncs/${encodeURIComponent(id)}/sync-now`, {
      method: "POST",
    }),

  /** POST /api/v1/channels/{handle}/videos — create a draft video (auth, owner). */
  createVideoDraft: (handle: string, body: CreateVideoRequest) =>
    apiRequest<Video>(`/api/v1/channels/${encodeURIComponent(handle)}/videos`, {
      method: "POST",
      body,
    }),

  /** PATCH /api/v1/videos/{id} — update a video's metadata (auth, owner). */
  updateVideo: (id: string, body: UpdateVideoRequest) =>
    apiRequest<Video>(`/api/v1/videos/${encodeURIComponent(id)}`, { method: "PATCH", body }),

  /** DELETE /api/v1/videos/{id} — delete a video (auth, owner; idempotent 204). */
  deleteVideo: (id: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * POST /api/v1/videos/{id}/file — upload the original file (auth, owner). The
   * multipart body moves the draft to processing and (with no prober) publishes it.
   * The ONE XHR-based call (fetch cannot report request-body progress):
   * `onProgress` receives determinate byte progress, and aborting `signal`
   * cancels the transfer (the promise rejects with the "upload_cancelled"
   * ApiError — see isUploadCancelled). Errors carry the same ApiError envelope
   * as every apiRequest call.
   */
  uploadVideoFile: (
    videoId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append("file", file);
    return uploadWithProgress<UploadVideoResult>(
      `${apiBaseUrl}/api/v1/videos/${encodeURIComponent(videoId)}/file`,
      form,
      { token: getAccessToken(), onProgress, signal },
    );
  },

  /**
   * POST /api/v1/videos/{id}/thumbnail — set a custom poster image (auth, owner,
   * multipart). Replaces any auto-generated/previous thumbnail. JPEG/PNG/WebP.
   */
  setVideoThumbnail: (videoId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<VideoFile>(`/api/v1/videos/${encodeURIComponent(videoId)}/thumbnail`, {
      method: "POST",
      body: form,
    });
  },

  /**
   * POST /api/v1/videos/{id}/thumbnail (application/json {at_seconds}) — pick the
   * poster from an exact frame of the processed original, extracted server-side
   * with ffmpeg (UPLOAD-04 frame-pick). Replaces any previous/auto poster and
   * leaves the video's state unchanged. Typed failures the caller surfaces: 409
   * while the video has no processed original yet, 422 when at_seconds is outside
   * [0, duration), 503 when the instance has no ffmpeg frame extractor.
   */
  setVideoThumbnailFrame: (videoId: string, atSeconds: number) =>
    apiRequest<VideoFile>(`/api/v1/videos/${encodeURIComponent(videoId)}/thumbnail`, {
      method: "POST",
      body: { at_seconds: atSeconds },
    }),

  /**
   * POST /api/v1/videos/{id}/import — enqueue an ASYNC URL import (auth, owner).
   * Returns 202 with the queued job; the backend fetches (SSRF-guarded) and runs
   * the pipeline in the background. Poll getVideoImport for progress.
   *
   * `resolver` selects the fetch mechanism (auto|direct|ytdlp). The UI always
   * sends "auto" — it never guesses whether a URL is a direct file or a platform
   * watch page; the backend probes and, when enabled, falls back to the sandboxed
   * yt-dlp extractor. An explicit disabled resolver answers 503.
   */
  importVideoFile: (videoId: string, url: string, resolver: ImportResolver = "auto") =>
    apiRequest<ImportJobResponse>(`/api/v1/videos/${encodeURIComponent(videoId)}/import`, {
      method: "POST",
      body: { url, resolver },
    }),

  /**
   * GET /api/v1/videos/{id}/import — the video's latest URL-import job (auth,
   * owner). state is pending/running/done/failed; on failure `error` is a safe,
   * human-readable reason. A video that was never imported → 404.
   */
  getVideoImport: (videoId: string, signal?: AbortSignal) =>
    apiRequest<ImportJobResponse>(`/api/v1/videos/${encodeURIComponent(videoId)}/import`, { signal }),

  /**
   * GET /api/v1/me/uploads — the caller's ACTIVE (unfinished, unexpired) resumable
   * upload sessions (server-side draft recovery, UPLOAD-03). The server is the
   * source of truth for in-progress uploads — a client that lost its localStorage
   * (a refresh, or a different device) reconstructs its resume offers from here.
   * Pass `fingerprint` to narrow to sessions for one exact file ("am I already
   * uploading this?").
   */
  listMyUploads: (fingerprint?: string, signal?: AbortSignal) =>
    apiRequest<ActiveUploadsResponse>("/api/v1/me/uploads", {
      query: { fingerprint: fingerprint || undefined },
      signal,
    }),

  /**
   * POST /api/v1/videos/{id}/upload-session — open a resumable (chunked) upload
   * session for the video's original file (auth, owner). Validates the declared
   * size/extension/quota up front; returns the fixed chunk size + total chunks.
   */
  createUploadSession: (videoId: string, body: CreateUploadSessionRequest) =>
    apiRequest<UploadSessionResponse>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/upload-session`,
      { method: "POST", body },
    ),

  /**
   * POST /api/v1/videos/{id}/replace-session — open a resumable (chunked)
   * session whose completion REPLACES a published video's source file
   * (config-parity W14; auth, owner or moderator/admin). Same chunk/complete
   * machinery as a plain upload session; completion answers 200 with the
   * still-published video + new source file. 403 feature_disabled while
   * video_replace_enabled is off; 409 replace_conflict while the video is not
   * published / still transcoding / already being replaced.
   */
  createReplaceSession: (videoId: string, body: CreateUploadSessionRequest) =>
    apiRequest<UploadSessionResponse>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/replace-session`,
      { method: "POST", body },
    ),

  /**
   * GET /api/v1/uploads/{upload_id} — the resume contract: which chunk indices
   * have landed (owner only). Read after an interruption to skip received chunks.
   */
  getUploadSession: (uploadId: string, signal?: AbortSignal) =>
    apiRequest<UploadStatusResponse>(`/api/v1/uploads/${encodeURIComponent(uploadId)}`, { signal }),

  /**
   * DELETE /api/v1/uploads/{upload_id} — cancel a resumable upload and drop its
   * chunk blobs (auth, owner; idempotent 204).
   */
  cancelUploadSession: (uploadId: string) =>
    apiRequest<void>(`/api/v1/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" }),

  /**
   * POST /api/v1/uploads/{upload_id}/complete — assemble the session's chunks and
   * finalise the video through the same pipeline as a direct upload (auth, owner).
   * Returns the finalised video (state "published", or "failed" if a probe rejected it).
   */
  completeUploadSession: (uploadId: string) =>
    apiRequest<UploadVideoResult>(`/api/v1/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
    }),

  /**
   * POST /api/v1/me/avatar — set the caller's account avatar (auth, multipart,
   * JPEG/PNG/WebP by extension; otherwise 415). Served publicly at
   * GET /users/{id}/avatar (see userAvatarUrl).
   */
  setMyAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>("/api/v1/me/avatar", { method: "POST", body: form });
  },

  /** DELETE /api/v1/me/avatar — remove the caller's account avatar (404 when none set). */
  deleteMyAvatar: () => apiRequest<void>("/api/v1/me/avatar", { method: "DELETE" }),

  /**
   * POST /api/v1/me/banner — set the caller's account (profile) banner (auth,
   * multipart, same type gate as the avatar). Served publicly at
   * GET /users/{id}/banner (see userBannerUrl).
   */
  setMyBanner: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>("/api/v1/me/banner", { method: "POST", body: form });
  },

  /** DELETE /api/v1/me/banner — remove the caller's account banner (404 when none set). */
  deleteMyBanner: () => apiRequest<void>("/api/v1/me/banner", { method: "DELETE" }),

  /**
   * POST /api/v1/channels/{handle}/avatar — set a channel's avatar (auth, owner
   * only — a non-owner/unknown handle is 404; multipart, JPEG/PNG/WebP else 415).
   */
  setChannelAvatar: (handle: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>(
      `/api/v1/channels/${encodeURIComponent(handle)}/avatar`,
      { method: "POST", body: form },
    );
  },

  /** DELETE /api/v1/channels/{handle}/avatar — remove a channel's avatar (auth, owner). */
  deleteChannelAvatar: (handle: string) =>
    apiRequest<void>(`/api/v1/channels/${encodeURIComponent(handle)}/avatar`, {
      method: "DELETE",
    }),

  /**
   * POST /api/v1/channels/{handle}/banner — set a channel's banner (auth, owner
   * only; same type gate / 404-for-non-owner semantics as the avatar route).
   */
  setChannelBanner: (handle: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>(
      `/api/v1/channels/${encodeURIComponent(handle)}/banner`,
      { method: "POST", body: form },
    );
  },

  /** DELETE /api/v1/channels/{handle}/banner — remove a channel's banner (auth, owner). */
  deleteChannelBanner: (handle: string) =>
    apiRequest<void>(`/api/v1/channels/${encodeURIComponent(handle)}/banner`, {
      method: "DELETE",
    }),

  /** POST /api/v1/channels/{handle}/live — create a live stream (auth, owner). Returns the key once. */
  createLiveStream: (handle: string, body: CreateLiveStreamRequest) =>
    apiRequest<CreateLiveStreamResponse>(`/api/v1/channels/${encodeURIComponent(handle)}/live`, {
      method: "POST",
      body,
    }),

  /** GET /api/v1/channels/{handle}/live — the channel's live streams (auth, owner; no keys). */
  getLiveStreams: (handle: string, signal?: AbortSignal) =>
    apiRequest<LiveStreamListResponse>(`/api/v1/channels/${encodeURIComponent(handle)}/live`, { signal }),

  /**
   * GET /api/v1/live — the public "Live now" listing: currently-live PUBLIC
   * streams across all channels, most-recent session first, for the home
   * discovery rail. Auth is optional. Each card links to /live/{id}. The
   * contract deliberately carries NO viewer/concurrent count and NO thumbnail
   * (neither exists server-side yet — W4 dependencies), so neither is surfaced.
   */
  listLivePublicStreams: (
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<LivePublicListResponse>("/api/v1/live", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * GET /api/v1/live/{id} — a single live stream's public metadata (the watch
   * surface). A private stream is visible only to its owner (else 404). While
   * live, the response carries `hls_url`; the stream key is never returned.
   */
  getLiveStream: (id: string, signal?: AbortSignal) =>
    apiRequest<LiveStream>(`/api/v1/live/${encodeURIComponent(id)}`, { signal }),

  /** PATCH /api/v1/live/{id} — edit a live stream (auth, owner). Never rotates the key. */
  updateLiveStream: (id: string, body: UpdateLiveStreamRequest) =>
    apiRequest<LiveStream>(`/api/v1/live/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    }),

  /** POST /api/v1/live/{id}/key — rotate a stream's key (auth, owner). Returns the new key once. */
  regenerateLiveStreamKey: (id: string) =>
    apiRequest<LiveStreamKey>(`/api/v1/live/${encodeURIComponent(id)}/key`, { method: "POST" }),

  /** DELETE /api/v1/live/{id} — delete a live stream (auth, owner; idempotent). */
  deleteLiveStream: (id: string) =>
    apiRequest<void>(`/api/v1/live/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** GET /api/v1/videos/{id}/captions — a video's caption tracks (public). */
  getCaptions: (videoId: string, signal?: AbortSignal) =>
    apiRequest<CaptionListResponse>(`/api/v1/videos/${encodeURIComponent(videoId)}/captions`, { signal }),

  /** POST /api/v1/videos/{id}/captions — upload a WebVTT caption track (owner, multipart). */
  uploadCaption: (videoId: string, input: { language: string; label?: string; file: File }) => {
    const form = new FormData();
    form.append("language", input.language);
    if (input.label) form.append("label", input.label);
    form.append("file", input.file);
    return apiRequest<Caption>(`/api/v1/videos/${encodeURIComponent(videoId)}/captions`, {
      method: "POST",
      body: form,
    });
  },

  /** DELETE /api/v1/videos/{id}/captions/{lang} — remove a caption track (owner, idempotent). */
  deleteCaption: (videoId: string, language: string) =>
    apiRequest<void>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/captions/${encodeURIComponent(language)}`,
      { method: "DELETE" },
    ),

  /**
   * GET /api/v1/videos/{id}/chapters — a video's seek-bar chapters (CORE-15),
   * ascending by start_seconds, empty when none. Same visibility as the detail
   * endpoint (private → owner only); the detail's has_chapters flag gates the
   * fetch. Optional token so an owner's private-video studio editor can read them.
   */
  getVideoChapters: (videoId: string, token?: string, signal?: AbortSignal) =>
    apiRequest<VideoChapters>(`/api/v1/videos/${encodeURIComponent(videoId)}/chapters`, {
      token,
      signal,
    }),

  /**
   * PUT /api/v1/videos/{id}/chapters — replace a video's whole chapter set atomically
   * (owner). An empty array clears all chapters. 400 on a validation violation
   * (bad ordering, out-of-bounds start, bad title length, or >100 chapters).
   */
  setVideoChapters: (videoId: string, body: SetVideoChaptersRequest) =>
    apiRequest<VideoChapters>(`/api/v1/videos/${encodeURIComponent(videoId)}/chapters`, {
      method: "PUT",
      body,
    }),

  // --- Password-protected videos + embed privacy (CORE-17 / W1.7) ----------

  /**
   * POST /api/v1/videos/{id}/unlock — verify a password against a
   * password-protected video and mint a short-lived (6h), video-scoped playback
   * token (CORE-17). Optional auth. 401 = incorrect password; 429 = rate limited
   * (same strict budget as login); 404 = no such video or it is not password
   * protected. The password and the returned token are NEVER logged (the token
   * lives only in the in-memory playback-token store).
   */
  unlockVideo: (id: string, password: string) =>
    apiRequest<UnlockVideoResponse>(`/api/v1/videos/${encodeURIComponent(id)}/unlock`, {
      method: "POST",
      body: { password },
    }),

  /**
   * GET /api/v1/videos/{id}/passwords — list a video's passwords (id +
   * created_at only; the plaintext/hash are write-only). Owner only; a
   * non-owner/unknown id is 404.
   */
  listVideoPasswords: (id: string, signal?: AbortSignal) =>
    apiRequest<VideoPasswords>(`/api/v1/videos/${encodeURIComponent(id)}/passwords`, { signal }),

  /**
   * POST /api/v1/videos/{id}/passwords — add one password to a video (owner).
   * The password must be 6–100 characters (else 400). Returns the new row's id +
   * created_at (never the plaintext).
   */
  addVideoPassword: (id: string, password: string) =>
    apiRequest<VideoPassword>(`/api/v1/videos/${encodeURIComponent(id)}/passwords`, {
      method: "POST",
      body: { password },
    }),

  /**
   * PUT /api/v1/videos/{id}/passwords — replace a video's whole password set
   * (owner). 1–20 entries, each 6–100 characters (else 400). Returns the stored
   * set (id + created_at).
   */
  replaceVideoPasswords: (id: string, passwords: string[]) =>
    apiRequest<VideoPasswords>(`/api/v1/videos/${encodeURIComponent(id)}/passwords`, {
      method: "PUT",
      body: { passwords },
    }),

  /**
   * DELETE /api/v1/videos/{id}/passwords/{passwordId} — remove one password
   * (owner; 204). 409 when it is the LAST password of a privacy=password video
   * (which would otherwise leave the video unlockable by no one).
   */
  deleteVideoPassword: (id: string, passwordId: string) =>
    apiRequest<void>(
      `/api/v1/videos/${encodeURIComponent(id)}/passwords/${encodeURIComponent(passwordId)}`,
      { method: "DELETE" },
    ),

  /**
   * GET /api/v1/videos/{id}/embed-privacy — a video's embed-privacy policy
   * (CORE-17): the tier and, for "whitelist", the allow-listed hostnames.
   * Readable pre-unlock (WITHOUT the password gate) so the embed page can decide
   * before prompting. Optional `token` lets an owner read a private video's policy.
   */
  getVideoEmbedPrivacy: (id: string, token?: string, signal?: AbortSignal) =>
    apiRequest<EmbedPrivacy>(`/api/v1/videos/${encodeURIComponent(id)}/embed-privacy`, {
      token,
      signal,
    }),

  /**
   * PUT /api/v1/videos/{id}/embed-privacy — replace a video's embed-privacy
   * policy (owner). 400 on an unknown status, a "whitelist" with an empty/invalid
   * domain list (bare hostnames only — no scheme/port/path; ≤50), or
   * allowed_domains supplied with a non-whitelist status.
   */
  setVideoEmbedPrivacy: (id: string, body: EmbedPrivacy) =>
    apiRequest<EmbedPrivacy>(`/api/v1/videos/${encodeURIComponent(id)}/embed-privacy`, {
      method: "PUT",
      body,
    }),

  /**
   * POST /api/v1/videos/{id}/captions/auto — enqueue a Whisper auto-caption job
   * (owner, 202). `language` is an optional tag + transcription hint. 503 when
   * auto-captioning is disabled on the instance; 409 when a job is already
   * running; 422 for a malformed language tag.
   */
  requestAutoCaption: (videoId: string, body: AutoCaptionRequest = {}) =>
    apiRequest<CaptionJobResponse>(`/api/v1/videos/${encodeURIComponent(videoId)}/captions/auto`, {
      method: "POST",
      body,
    }),

  /**
   * GET /api/v1/videos/{id}/captions/auto — the latest auto-caption job's status
   * (owner). 404 when the video never requested auto-captioning. Poll for progress.
   */
  getAutoCaption: (videoId: string, signal?: AbortSignal) =>
    apiRequest<CaptionJobResponse>(`/api/v1/videos/${encodeURIComponent(videoId)}/captions/auto`, {
      signal,
    }),

  /** GET /api/v1/me/subscriptions/videos — videos from followed channels (auth). */
  getSubscriptionVideos: (params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<VideoFeedResponse>("/api/v1/me/subscriptions/videos", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * GET /api/v1/me/subscriptions — the LOCAL channels the caller follows
   * ("FOLLOWING" list), most recently followed first, each with follower_count
   * and followed_at (auth). Remote-channel follows are listed separately via
   * getRemoteFollows. Paginated via limit (1–100, default 20) and offset.
   */
  listFollowedChannels: (params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<FollowedChannelsResponse>("/api/v1/me/subscriptions", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /** GET /api/v1/videos/{id}/comments — a public video's comments, newest first. */
  getVideoComments: (id: string, params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<CommentListResponse>(
      `/api/v1/videos/${encodeURIComponent(id)}/comments`,
      { query: { limit: params.limit, offset: params.offset }, signal },
    ),

  /**
   * POST /api/v1/videos/{id}/comments — post a comment on a video (auth).
   * Pass `parentId` to reply to another comment on the same video; the server
   * threads it under that parent. Omitted → a top-level comment.
   */
  postComment: (id: string, body: string, parentId?: string) =>
    apiRequest<Comment>(`/api/v1/videos/${encodeURIComponent(id)}/comments`, {
      method: "POST",
      body: parentId ? { body, parent_id: parentId } : { body },
    }),

  /** PATCH /api/v1/comments/{id} — edit your own comment body (auth, author-only). */
  editComment: (id: string, body: string) =>
    apiRequest<Comment>(`/api/v1/comments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { body },
    }),

  /** DELETE /api/v1/comments/{id} — delete your own comment (auth). */
  deleteComment: (id: string) =>
    apiRequest<void>(`/api/v1/comments/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** POST /api/v1/me/mutes/accounts/{id} — mute an account (auth; idempotent 204). */
  muteAccount: (userId: string) =>
    apiRequest<void>(`/api/v1/me/mutes/accounts/${encodeURIComponent(userId)}`, {
      method: "POST",
    }),

  /** DELETE /api/v1/me/mutes/accounts/{id} — unmute an account (auth; idempotent 204). */
  unmuteAccount: (userId: string) =>
    apiRequest<void>(`/api/v1/me/mutes/accounts/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),

  /** GET /api/v1/me/mutes/accounts — the accounts the caller has muted, newest first (auth). */
  getMutedAccounts: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<MutedAccountListResponse>("/api/v1/me/mutes/accounts", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * POST /api/v1/me/mutes/instances/{domain} — mute a whole remote instance so
   * its content is hidden from the caller (auth; idempotent 204; invalid
   * domain → 422).
   */
  muteInstance: (domain: string) =>
    apiRequest<void>(`/api/v1/me/mutes/instances/${encodeURIComponent(domain)}`, {
      method: "POST",
    }),

  /** DELETE /api/v1/me/mutes/instances/{domain} — unmute an instance (auth; idempotent 204). */
  unmuteInstance: (domain: string) =>
    apiRequest<void>(`/api/v1/me/mutes/instances/${encodeURIComponent(domain)}`, {
      method: "DELETE",
    }),

  /** GET /api/v1/me/mutes/instances — the instances the caller has muted, newest first (auth). */
  getMutedInstances: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<MutedInstanceListResponse>("/api/v1/me/mutes/instances", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * GET /api/v1/remote-videos/{id} — a federated remote video's stored metadata
   * (public; 404 when unknown or its origin instance is admin-blocked).
   */
  getRemoteVideo: (id: string, signal?: AbortSignal) =>
    apiRequest<RemoteVideo>(`/api/v1/remote-videos/${encodeURIComponent(id)}`, { signal }),

  /**
   * POST /api/v1/remote-videos/{id}/report — file an abuse report against a
   * federated remote video (auth; target_type remote_video; idempotent per
   * reporter+target 204; unknown remote video → 404).
   */
  reportRemoteVideo: (id: string, reason: string) =>
    apiRequest<void>(`/api/v1/remote-videos/${encodeURIComponent(id)}/report`, {
      method: "POST",
      body: { reason },
    }),

  /**
   * POST /api/v1/me/remote-follows — follow a remote channel by "name@domain"
   * handle or actor URL (auth). Returns the follow row (state=pending until
   * the remote Accepts; idempotent re-follow returns the existing row).
   * Unresolvable/local target → 422; federation disabled → 503.
   */
  createRemoteFollow: (body: CreateRemoteFollowRequest) =>
    apiRequest<RemoteFollow>("/api/v1/me/remote-follows", { method: "POST", body }),

  /** GET /api/v1/me/remote-follows — the caller's remote-channel follows, newest first (auth). */
  listRemoteFollows: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<RemoteFollowListResponse>("/api/v1/me/remote-follows", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * DELETE /api/v1/me/remote-follows/{id} — unfollow a remote channel by follow
   * row id (auth, 204; local delete wins, an Undo{Follow} is queued). Unknown
   * or another user's id → 404.
   */
  deleteRemoteFollow: (id: string) =>
    apiRequest<void>(`/api/v1/me/remote-follows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // --- ATProto / Bluesky cross-posting (P11 extension) --------------------
  // OUTBOUND only: link a Bluesky account so newly published PUBLIC videos are
  // announced there. The write takes a Bluesky APP PASSWORD (never the main
  // password); the backend seals it and NEVER returns it — ATProtoStatus omits
  // it entirely. When the extension is disabled on this instance every call is
  // 503, which the UI surfaces as an honest "not enabled here" state.

  /**
   * GET /api/v1/me/atproto — the caller's linked Bluesky account status
   * (handle, DID, PDS, auto-post, last-post). 404 when nothing is linked; 503
   * when Bluesky cross-posting is disabled on this instance. Never the password.
   */
  getATProtoAccount: (signal?: AbortSignal) =>
    apiRequest<ATProtoStatus>("/api/v1/me/atproto", { signal }),

  /**
   * PUT /api/v1/me/atproto — link (or re-link) a Bluesky account. `app_password`
   * MUST be a Bluesky app password (Settings → App Passwords), not the main
   * password; the backend verifies it against the PDS and seals it at rest.
   * Bad handle/app-password/PDS → 422; PDS unreachable → 502; disabled → 503.
   */
  linkATProtoAccount: (body: ATProtoLinkRequest) =>
    apiRequest<ATProtoStatus>("/api/v1/me/atproto", { method: "PUT", body }),

  /**
   * DELETE /api/v1/me/atproto — unlink the Bluesky account (idempotent, 204).
   * No further auto cross-posts are made. 503 when the extension is disabled.
   */
  unlinkATProtoAccount: () => apiRequest<void>("/api/v1/me/atproto", { method: "DELETE" }),

  /**
   * GET /api/v1/admin/instances/blocked — the admin instance blocklist, newest
   * block first (admin/moderator).
   */
  getBlockedInstances: (
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<BlockedInstanceListResponse>("/api/v1/admin/instances/blocked", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * POST /api/v1/admin/instances/blocked — block a remote instance: inbound
   * activity dropped, content hidden, outbound deliveries cancelled
   * (admin/moderator; idempotent 204 — re-blocking refreshes the reason;
   * audited; invalid domain → 422).
   */
  blockInstance: (body: BlockInstanceRequest) =>
    apiRequest<void>("/api/v1/admin/instances/blocked", { method: "POST", body }),

  /** DELETE /api/v1/admin/instances/blocked/{domain} — unblock an instance (admin/moderator; idempotent 204). */
  unblockInstance: (domain: string) =>
    apiRequest<void>(`/api/v1/admin/instances/blocked/${encodeURIComponent(domain)}`, {
      method: "DELETE",
    }),

  /**
   * POST /api/v1/me/blocks/{id} — block an account (auth; idempotent 204). A
   * block symmetrically cuts off direct messaging. Self → 422, unknown → 404.
   */
  blockUser: (userId: string) =>
    apiRequest<void>(`/api/v1/me/blocks/${encodeURIComponent(userId)}`, { method: "POST" }),

  /** DELETE /api/v1/me/blocks/{id} — unblock an account (auth; idempotent 204). */
  unblockUser: (userId: string) =>
    apiRequest<void>(`/api/v1/me/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" }),

  /** GET /api/v1/me/blocks — the accounts the caller has blocked, newest first (auth). */
  getBlockedUsers: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<BlockedUserListResponse>("/api/v1/me/blocks", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * POST /api/v1/conversations — start (or get) the 1:1 conversation with a
   * recipient (auth). Idempotent: the same pair always maps to one conversation.
   *
   * Name the other participant by EXACTLY ONE of `recipient_id` or
   * `recipient_username` (the backend resolves the username server-side,
   * case-insensitive, active accounts only). Two calling forms:
   *  - `startConversation(recipientId)` — the id form (from a comment/profile
   *    where the user id is already known);
   *  - `startConversation({ recipientUsername })` — the username form (the
   *    "New message" composer, where the viewer types a username).
   * Pass `{ encrypted: true }` (as the object field or the second arg) to start
   * the pair's distinct ENCRYPTED thread (opaque per-device ciphertext).
   * Messaging yourself → 422; unknown recipient → 404; a block either way → 403.
   */
  startConversation: (
    target: string | { recipientId?: string; recipientUsername?: string; encrypted?: boolean },
    opts: { encrypted?: boolean } = {},
  ) => {
    const t = typeof target === "string" ? { recipientId: target } : target;
    const encrypted = t.encrypted ?? opts.encrypted ?? false;
    const body: Record<string, unknown> = {};
    if (t.recipientId) body.recipient_id = t.recipientId;
    if (t.recipientUsername) body.recipient_username = t.recipientUsername;
    if (encrypted) body.encrypted = true;
    return apiRequest<Conversation>("/api/v1/conversations", { method: "POST", body });
  },

  /** GET /api/v1/me/conversations — the caller's inbox, most-recently-active first (auth). */
  getConversations: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<ConversationListResponse>("/api/v1/me/conversations", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * GET /api/v1/conversations/{id}/messages — a conversation's messages, newest
   * first (auth). A non-participant (or unknown conversation) is 404.
   */
  getMessages: (
    conversationId: string,
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<MessageListResponse>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      { query: { limit: params.limit, offset: params.offset }, signal },
    ),

  /**
   * GET /api/v1/conversations/{id}/messages — a conversation's messages, newest
   * first (auth). Returns a MessageListResponse for a plaintext conversation and
   * an EncryptedMessageListResponse for an encrypted one (branch on which key is
   * present). A non-participant (or unknown conversation) is 404.
   */
  getConversationMessages: (
    conversationId: string,
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<MessageListResponse | EncryptedMessageListResponse>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      { query: { limit: params.limit, offset: params.offset }, signal },
    ),

  /**
   * POST /api/v1/conversations/{id}/messages — post a message to a plaintext
   * conversation (auth). A message needs a non-empty body OR at least one
   * `attachmentIds` entry (ids returned by uploadDMAttachment, ≤4). A
   * non-participant (or unknown conversation) is 404; body ≤5000 chars.
   */
  sendMessage: (conversationId: string, body: string, attachmentIds?: string[]) =>
    apiRequest<Message>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: {
        ...(body ? { body } : {}),
        ...(attachmentIds && attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
      },
    }),

  /**
   * POST /api/v1/conversations/{id}/attachments — upload a DM attachment (auth,
   * multipart "file"). Returns an id to reference in a subsequent sendMessage.
   * Allowed kinds image/video/audio/pdf, ≤25 MiB; 413 oversize, 415 unsupported
   * type, 422 encrypted conversation or failed malware scan, 503 storage off.
   *
   * With no `onProgress` this runs on the shared fetch client (indeterminate
   * "Uploading…"). Pass `onProgress` to observe byte-level upload progress —
   * fetch() can't, so a determinate composer chip routes through the same
   * XHR helper as the studio upload; errors map to the identical ApiError
   * envelope, so callers branch on status the same way regardless of transport.
   */
  uploadDMAttachment: (
    conversationId: string,
    file: File,
    opts?: { onProgress?: (progress: UploadProgress) => void; signal?: AbortSignal },
  ) => {
    const form = new FormData();
    form.append("file", file);
    const path = `/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments`;
    if (!opts?.onProgress) {
      return apiRequest<UploadAttachmentResponse>(path, { method: "POST", body: form });
    }
    return uploadWithProgress<UploadAttachmentResponse>(`${apiBaseUrl}${path}`, form, {
      token: getAccessToken(),
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
  },

  /**
   * GET /api/v1/attachments/{id} — the participant-gated bytes of a DM attachment
   * (auth). Fetched as a Blob (for an inline object-URL image or a download),
   * since the endpoint needs the bearer token an <img src> can't carry. An
   * unknown attachment or a non-participant caller is 404.
   */
  fetchAttachment: async (id: string, signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch(`${apiBaseUrl}/api/v1/attachments/${encodeURIComponent(id)}`, {
      headers: getAccessToken() ? { authorization: `Bearer ${getAccessToken() as string}` } : {},
      signal,
    });
    if (!res.ok) {
      throw new ApiError({
        status: res.status,
        code: "attachment_unavailable",
        message: "could not load this attachment",
      });
    }
    return res.blob();
  },

  /**
   * POST /api/v1/conversations/{id}/read — advance the caller's read watermark
   * (auth, idempotent, advance-only). With `messageId` it pins to that message;
   * without it, to the newest message. Non-participant/unknown → 404.
   */
  markConversationRead: (conversationId: string, messageId?: string) =>
    apiRequest<void>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: "POST",
      body: messageId ? { message_id: messageId } : undefined,
    }),

  /**
   * DELETE /api/v1/messages/{id} — sender-only soft delete (tombstone): the body
   * becomes "[deleted]" and attachments are removed (auth). A non-sender/unknown
   * message → 404; an already-deleted message is an idempotent 204.
   */
  deleteMessage: (messageId: string) =>
    apiRequest<void>(`/api/v1/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" }),

  /**
   * POST /api/v1/messages/{id}/report — file an abuse report against a DM
   * (auth; either participant; the body is snapshotted so the report survives a
   * sender tombstone; idempotent per reporter+message 204; non-participant → 404).
   */
  reportMessage: (messageId: string, reason: string) =>
    apiRequest<void>(`/api/v1/messages/${encodeURIComponent(messageId)}/report`, {
      method: "POST",
      body: { reason },
    }),

  /**
   * POST /api/v1/conversations/{id}/messages on an ENCRYPTED conversation —
   * per-recipient-device ciphertext envelopes (+ optional disappearing timer).
   * The server stores them opaquely and returns a summary (not the envelopes).
   */
  sendEncryptedMessage: (conversationId: string, body: SendEncryptedMessageRequest) =>
    apiRequest<SendEncryptedResponse>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: "POST", body },
    ),

  /**
   * POST /api/v1/e2ee/devices — register an E2EE device's PUBLIC identity/signing
   * keys under a user-visible name (auth). At most 20 devices per user (422 beyond).
   */
  registerE2EEDevice: (body: RegisterE2EEDeviceRequest) =>
    apiRequest<E2EEDevice>("/api/v1/e2ee/devices", { method: "POST", body }),

  /**
   * GET /api/v1/e2ee/devices — the caller's registered devices, oldest first
   * (auth). Also the client's E2EE availability probe (a non-404 means the
   * backend advertises the contract).
   */
  listMyE2EEDevices: (signal?: AbortSignal) =>
    apiRequest<E2EEDeviceListResponse>("/api/v1/e2ee/devices", { signal }),

  /** DELETE /api/v1/e2ee/devices/{id} — remove one of the caller's devices (auth; 204; 404 if not owned). */
  deleteE2EEDevice: (id: string) =>
    apiRequest<void>(`/api/v1/e2ee/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** POST /api/v1/e2ee/devices/{id}/one-time-keys — upload a batch of PUBLIC prekeys (auth, owner). */
  uploadE2EEOneTimeKeys: (deviceId: string, oneTimeKeys: E2EEOneTimeKey[]) =>
    apiRequest<UploadOneTimeKeysResponse>(
      `/api/v1/e2ee/devices/${encodeURIComponent(deviceId)}/one-time-keys`,
      { method: "POST", body: { one_time_keys: oneTimeKeys } },
    ),

  /** GET /api/v1/e2ee/devices/{id}/one-time-keys/count — unclaimed prekey count (auth, owner). */
  countE2EEOneTimeKeys: (deviceId: string, signal?: AbortSignal) =>
    apiRequest<OneTimeKeyCountResponse>(
      `/api/v1/e2ee/devices/${encodeURIComponent(deviceId)}/one-time-keys/count`,
      { signal },
    ),

  /**
   * GET /api/v1/users/{id}/e2ee/devices — a peer's PUBLIC device keys (auth,
   * participant-gated). Used for the safety-number display and inbound-message
   * sender resolution. 404 for an unknown user or no shared conversation; 403 on a block.
   */
  listUserE2EEDevices: (userId: string, signal?: AbortSignal) =>
    apiRequest<E2EEDeviceListResponse>(
      `/api/v1/users/${encodeURIComponent(userId)}/e2ee/devices`,
      { signal },
    ),

  /**
   * POST /api/v1/users/{id}/e2ee/claim — atomically claim ONE one-time key per
   * device of the target user, for establishing an Olm session per device pair
   * (auth, participant-gated; single-use). Claiming your own devices is allowed.
   */
  claimE2EEOneTimeKeys: (userId: string) =>
    apiRequest<E2EEClaimResponse>(`/api/v1/users/${encodeURIComponent(userId)}/e2ee/claim`, {
      method: "POST",
    }),

  /** POST /api/v1/videos/{id}/report — file an abuse report on a video (auth; idempotent 204). */
  reportVideo: (id: string, reason: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/report`, {
      method: "POST",
      body: { reason },
    }),

  /** POST /api/v1/comments/{id}/report — file an abuse report on a comment (auth; idempotent 204). */
  reportComment: (id: string, reason: string) =>
    apiRequest<void>(`/api/v1/comments/${encodeURIComponent(id)}/report`, {
      method: "POST",
      body: { reason },
    }),

  /** POST /api/v1/users/{id}/report — file an abuse report on an account (auth; self 422, unknown 404, idempotent 204). */
  reportAccount: (id: string, reason: string) =>
    apiRequest<void>(`/api/v1/users/${encodeURIComponent(id)}/report`, {
      method: "POST",
      body: { reason },
    }),

  /** GET /api/v1/videos/{id}/rating — like/dislike counts (+ my_rating if authed). */
  getVideoRating: (id: string, signal?: AbortSignal) =>
    apiRequest<VideoRating>(`/api/v1/videos/${encodeURIComponent(id)}/rating`, { signal }),

  /** PUT /api/v1/videos/{id}/rating — set/change your rating (auth). */
  setVideoRating: (id: string, rating: RatingValue) =>
    apiRequest<VideoRating>(`/api/v1/videos/${encodeURIComponent(id)}/rating`, {
      method: "PUT",
      body: { rating },
    }),

  /** DELETE /api/v1/videos/{id}/rating — clear your rating (auth). */
  clearVideoRating: (id: string) =>
    apiRequest<VideoRating>(`/api/v1/videos/${encodeURIComponent(id)}/rating`, { method: "DELETE" }),

  /** GET /api/v1/me/saved — the caller's saved videos as cards (auth). */
  getSavedVideos: (params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<VideoFeedResponse>("/api/v1/me/saved", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /** POST /api/v1/videos/{id}/save — save a video to your library (auth, idempotent). */
  saveVideo: (id: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/save`, { method: "POST" }),

  /** DELETE /api/v1/videos/{id}/save — remove a video from your library (auth, idempotent). */
  unsaveVideo: (id: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/save`, { method: "DELETE" }),

  /** GET /api/v1/me/history — the caller's watch history as cards, newest-watched first (auth). */
  getWatchHistory: (params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<WatchHistoryResponse>("/api/v1/me/history", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /** GET /api/v1/videos/{id}/watch-progress — the caller's saved resume position (auth). */
  getWatchProgress: (id: string, signal?: AbortSignal) =>
    apiRequest<WatchProgress>(`/api/v1/videos/${encodeURIComponent(id)}/watch-progress`, { signal }),

  /** PUT /api/v1/videos/{id}/watch-progress — record the caller's resume position (auth, 204). */
  recordWatchProgress: (id: string, positionSeconds: number) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/watch-progress`, {
      method: "PUT",
      body: { position_seconds: positionSeconds },
    }),

  /** DELETE /api/v1/me/history/{id} — remove one video from history (auth, idempotent). */
  deleteHistoryEntry: (id: string) =>
    apiRequest<void>(`/api/v1/me/history/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** DELETE /api/v1/me/history — clear the caller's entire watch history (auth, idempotent). */
  clearWatchHistory: () => apiRequest<void>("/api/v1/me/history", { method: "DELETE" }),

  /** GET /api/v1/me/notifications — the caller's notifications + unread count (auth). */
  getNotifications: (
    params: { unread?: boolean; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<NotificationListResponse>("/api/v1/me/notifications", {
      query: { unread: params.unread, limit: params.limit, offset: params.offset },
      signal,
    }),

  /** GET /api/v1/me/notifications/unread-count — just the unread count, for a badge (auth). */
  getUnreadNotificationCount: (signal?: AbortSignal) =>
    apiRequest<UnreadCountResponse>("/api/v1/me/notifications/unread-count", { signal }),

  /** POST /api/v1/me/notifications/{id}/read — mark one notification read (auth, idempotent). */
  markNotificationRead: (id: string) =>
    apiRequest<void>(`/api/v1/me/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),

  /** POST /api/v1/me/notifications/read-all — mark all notifications read (auth, idempotent). */
  markAllNotificationsRead: () =>
    apiRequest<void>("/api/v1/me/notifications/read-all", { method: "POST" }),

  /**
   * GET /api/v1/me/notification-prefs — the caller's per-type notification
   * switchboard (auth). Types never configured default to enabled.
   */
  getNotificationPrefs: (signal?: AbortSignal) =>
    apiRequest<NotificationPrefsResponse>("/api/v1/me/notification-prefs", { signal }),

  /**
   * PATCH /api/v1/me/notification-prefs — partial preference update (auth):
   * only the types present are changed; an unknown type is 422 and nothing is
   * written. Returns the full updated map.
   */
  updateNotificationPrefs: (prefs: Record<string, boolean>) =>
    apiRequest<NotificationPrefsResponse>("/api/v1/me/notification-prefs", {
      method: "PATCH",
      body: { prefs },
    }),

  /** GET /api/v1/me/playlists — the caller's playlists, newest first (auth). */
  getMyPlaylists: (signal?: AbortSignal) =>
    apiRequest<PlaylistListResponse>("/api/v1/me/playlists", { signal }),

  /** POST /api/v1/playlists — create a playlist (auth). */
  createPlaylist: (body: CreatePlaylistRequest) =>
    apiRequest<Playlist>("/api/v1/playlists", { method: "POST", body }),

  /** GET /api/v1/playlists/{id} — a playlist + its ordered video cards. */
  getPlaylist: (id: string, signal?: AbortSignal) =>
    apiRequest<PlaylistDetail>(`/api/v1/playlists/${encodeURIComponent(id)}`, { signal }),

  /** PATCH /api/v1/playlists/{id} — update a playlist (auth, owner). */
  updatePlaylist: (id: string, body: UpdatePlaylistRequest) =>
    apiRequest<Playlist>(`/api/v1/playlists/${encodeURIComponent(id)}`, { method: "PATCH", body }),

  /** DELETE /api/v1/playlists/{id} — delete a playlist (auth, owner). */
  deletePlaylist: (id: string) =>
    apiRequest<void>(`/api/v1/playlists/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** POST /api/v1/playlists/{id}/videos — add a video to a playlist (auth, owner, idempotent). */
  addToPlaylist: (id: string, videoId: string) =>
    apiRequest<void>(`/api/v1/playlists/${encodeURIComponent(id)}/videos`, {
      method: "POST",
      body: { video_id: videoId },
    }),

  /** DELETE /api/v1/playlists/{id}/videos/{videoId} — remove a video (auth, owner, idempotent). */
  removeFromPlaylist: (id: string, videoId: string) =>
    apiRequest<void>(
      `/api/v1/playlists/${encodeURIComponent(id)}/videos/${encodeURIComponent(videoId)}`,
      { method: "DELETE" },
    ),

  /**
   * PUT /api/v1/playlists/{id}/videos — reorder items (auth, owner). videoIds must
   * be exactly the playlist's current video ids in the desired order; a mismatch
   * (missing/extra/duplicate) is 422.
   */
  reorderPlaylist: (id: string, videoIds: string[]) =>
    apiRequest<void>(`/api/v1/playlists/${encodeURIComponent(id)}/videos`, {
      method: "PUT",
      body: { video_ids: videoIds },
    }),

  /**
   * POST /api/v1/playlists/{id}/thumbnail — set a playlist's cover image (auth,
   * owner, multipart). Replaces any previous cover. JPEG/PNG/WebP else 415.
   */
  setPlaylistThumbnail: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<Playlist>(`/api/v1/playlists/${encodeURIComponent(id)}/thumbnail`, {
      method: "POST",
      body: form,
    });
  },

  /** DELETE /api/v1/playlists/{id}/thumbnail — remove a playlist's cover (owner, idempotent). */
  deletePlaylistThumbnail: (id: string) =>
    apiRequest<void>(`/api/v1/playlists/${encodeURIComponent(id)}/thumbnail`, { method: "DELETE" }),

  /**
   * GET /api/v1/admin/reports — the moderation queue, newest first (moderator/admin).
   * Pass `openOnly` to return only unresolved reports.
   */
  getReports: (
    params: { openOnly?: boolean; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<ReportListResponse>("/api/v1/admin/reports", {
      query: {
        status: params.openOnly ? "open" : undefined,
        limit: params.limit,
        offset: params.offset,
      },
      signal,
    }),

  /** POST /api/v1/admin/reports/{id}/resolve — accept/reject a report (moderator/admin, 204). */
  resolveReport: (id: string, body: ResolveReportRequest) =>
    apiRequest<void>(`/api/v1/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body,
    }),

  /**
   * DELETE /api/v1/admin/reports/{id} — permanently remove a report row (admin
   * only — moderators resolve but cannot purge; idempotent 204). Notifications
   * referencing the report are removed with it. Audited.
   */
  deleteReport: (id: string) =>
    apiRequest<void>(`/api/v1/admin/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * GET /api/v1/admin/users — accounts newest first (admin only). Optional `q`
   * filters by a username/email substring. Paginated via limit/offset.
   */
  getAdminUsers: (
    params: { q?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AdminUserListResponse>("/api/v1/admin/users", {
      query: { q: params.q, limit: params.limit, offset: params.offset },
      signal,
    }),

  /** PATCH /api/v1/admin/users/{id} — edit a user's role / active flag (admin only). */
  updateAdminUser: (id: string, body: UpdateUserRequest) =>
    apiRequest<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    }),

  /**
   * DELETE /api/v1/admin/users/{id} — IRREVERSIBLE admin hard delete of an
   * account (same semantics as the self-serve DELETE /auth/me: channels and
   * videos purged, comments tombstoned, per-user data erased, sessions
   * revoked, row anonymised) but with no password confirmation. Self-guarded:
   * an admin cannot hard-delete their own account (422). Audited (204).
   */
  deleteAdminUser: (id: string) =>
    apiRequest<void>(`/api/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * GET /api/v1/admin/registration-requests — the registration approval queue,
   * newest first (admin only). status="pending" returns only unresolved requests.
   */
  getRegistrationRequests: (
    params: { status?: "pending"; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<RegistrationRequestListResponse>("/api/v1/admin/registration-requests", {
      query: { status: params.status, limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * POST /api/v1/admin/registration-requests/{id}/approve — approve a pending
   * request, creating the account from the stored credentials (admin only, 204).
   * 404 if unknown/already resolved; 409 if the username/email has since been taken.
   */
  approveRegistrationRequest: (id: string) =>
    apiRequest<void>(
      `/api/v1/admin/registration-requests/${encodeURIComponent(id)}/approve`,
      { method: "POST" },
    ),

  /**
   * POST /api/v1/admin/registration-requests/{id}/reject — reject a pending
   * request with an optional internal note (admin only, 204). 404 if
   * unknown/already resolved.
   */
  rejectRegistrationRequest: (id: string, body: RejectRegistrationRequest = {}) =>
    apiRequest<void>(
      `/api/v1/admin/registration-requests/${encodeURIComponent(id)}/reject`,
      { method: "POST", body },
    ),

  /**
   * GET /api/v1/admin/federation/follower-requests — pending inbound
   * ActivityPub channel Follows awaiting an admin decision, newest first
   * (federation_follower_approval, config-parity W12; admin only).
   */
  getFederationFollowerRequests: (
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<FederationFollowerRequestListResponse>(
      "/api/v1/admin/federation/follower-requests",
      { query: { limit: params.limit, offset: params.offset }, signal },
    ),

  /**
   * POST /api/v1/admin/federation/follower-requests/{id}/approve — accept one
   * pending channel Follow: the follow flips to accepted and the Accept
   * activity is queued to the follower's inbox (admin only, 204). 404 if
   * unknown/already resolved.
   */
  approveFederationFollowerRequest: (id: string) =>
    apiRequest<void>(
      `/api/v1/admin/federation/follower-requests/${encodeURIComponent(id)}/approve`,
      { method: "POST" },
    ),

  /**
   * POST /api/v1/admin/federation/follower-requests/{id}/reject — reject one
   * pending channel Follow: the pending follow is removed and a Reject
   * activity is queued to the follower's inbox (admin only, 204). 404 if
   * unknown/already resolved.
   */
  rejectFederationFollowerRequest: (id: string) =>
    apiRequest<void>(
      `/api/v1/admin/federation/follower-requests/${encodeURIComponent(id)}/reject`,
      { method: "POST" },
    ),

  /** GET /api/v1/admin/audit-log — the security audit trail, newest first (admin). */
  getAuditLog: (
    params: { action?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AuditLogListResponse>("/api/v1/admin/audit-log", {
      query: { action: params.action, limit: params.limit, offset: params.offset },
      signal,
    }),

  /** GET /api/v1/admin/system — operational status snapshot (admin). */
  getSystemStatus: (signal?: AbortSignal) =>
    apiRequest<SystemStatus>("/api/v1/admin/system", { signal }),

  /**
   * GET /api/v1/admin/stats — instance-wide overview counts for the admin
   * dashboard's stat cards (admin only). Every field is a live COUNT/SUM; the
   * contract carries no period-over-period deltas.
   */
  getAdminStats: (signal?: AbortSignal) =>
    apiRequest<AdminStats>("/api/v1/admin/stats", { signal }),

  /**
   * GET /api/v1/admin/videos/blocked — currently-blocked videos, newest block
   * first (moderator/admin). Paginated via limit/offset.
   */
  getBlockedVideos: (
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<BlockedVideoListResponse>("/api/v1/admin/videos/blocked", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * GET /api/v1/admin/remote-videos/blocked — currently-blocked federated
   * remote videos, newest block first (moderator/admin). Paginated via
   * limit/offset.
   */
  getBlockedRemoteVideos: (
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<BlockedRemoteVideoListResponse>("/api/v1/admin/remote-videos/blocked", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * POST /api/v1/admin/remote-videos/{id}/block — block a federated remote
   * video so it is hidden from all local surfaces (moderator/admin,
   * idempotent, 204, audited). The optional reason is recorded for the audit
   * trail. Unknown id → 404.
   */
  blockRemoteVideo: (id: string, body: BlockVideoRequest = {}) =>
    apiRequest<void>(`/api/v1/admin/remote-videos/${encodeURIComponent(id)}/block`, {
      method: "POST",
      body,
    }),

  /** DELETE /api/v1/admin/remote-videos/{id}/block — lift a remote video's block (moderator/admin, idempotent, 204). */
  unblockRemoteVideo: (id: string) =>
    apiRequest<void>(`/api/v1/admin/remote-videos/${encodeURIComponent(id)}/block`, {
      method: "DELETE",
    }),

  /**
   * GET /api/v1/admin/videos — all videos (any privacy/state) newest first, each
   * with its block status (moderator/admin). Optional `q` filters by title.
   */
  getAdminVideos: (
    params: { q?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AdminVideoListResponse>("/api/v1/admin/videos", {
      query: { q: params.q, limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * GET /api/v1/admin/comments — all comments newest first, each with its author
   * and the video it's on (moderator/admin). Optional `q` filters by body.
   */
  getAdminComments: (
    params: { q?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AdminCommentListResponse>("/api/v1/admin/comments", {
      query: { q: params.q, limit: params.limit, offset: params.offset },
      signal,
    }),

  /** GET /api/v1/admin/watched-words — the watched-words list, newest first (moderator/admin). */
  getWatchedWords: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<WatchedWordListResponse>("/api/v1/admin/watched-words", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /** GET /api/v1/admin/watched-word-matches — comments flagged by a watched term (mod/admin). */
  getWatchedWordMatches: (params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    apiRequest<WatchedWordMatchListResponse>("/api/v1/admin/watched-word-matches", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /** POST /api/v1/admin/watched-words — add a watched term (moderator/admin; 409 on duplicate). */
  addWatchedWord: (word: string) =>
    apiRequest<WatchedWord>("/api/v1/admin/watched-words", {
      method: "POST",
      body: { word },
    }),

  /** DELETE /api/v1/admin/watched-words/{id} — remove a watched term (moderator/admin, idempotent). */
  deleteWatchedWord: (id: string) =>
    apiRequest<void>(`/api/v1/admin/watched-words/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * POST /api/v1/admin/videos/{id}/block — block a video so it is hidden from
   * public surfaces (moderator/admin, idempotent, 204). The optional reason is
   * recorded for the audit trail.
   */
  blockVideo: (id: string, body: BlockVideoRequest = {}) =>
    apiRequest<void>(`/api/v1/admin/videos/${encodeURIComponent(id)}/block`, {
      method: "POST",
      body,
    }),

  /** DELETE /api/v1/admin/videos/{id}/block — lift a video's block (moderator/admin, idempotent, 204). */
  unblockVideo: (id: string) =>
    apiRequest<void>(`/api/v1/admin/videos/${encodeURIComponent(id)}/block`, {
      method: "DELETE",
    }),

  /**
   * GET /api/v1/admin/videos/quarantined — uploads held for moderator review
   * (QUARANTINE_NEW_UPLOADS), newest first (moderator/admin).
   */
  getQuarantinedVideos: (
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<QuarantinedVideoListResponse>("/api/v1/admin/videos/quarantined", {
      query: { limit: params.limit, offset: params.offset },
      signal,
    }),

  /**
   * POST /api/v1/admin/videos/{id}/approve — release a quarantined upload by
   * publishing it through the real publish transition (moderator/admin, 204).
   * Only a currently-quarantined video can be approved (409 otherwise).
   */
  approveQuarantinedVideo: (id: string) =>
    apiRequest<void>(`/api/v1/admin/videos/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    }),

  /**
   * POST /api/v1/admin/videos/{id}/reject — fail a quarantined upload
   * (moderator/admin, 204): it never publishes, the owner is notified (the
   * moderator's identity is not exposed), and the optional reason is recorded
   * in the audit trail. Only a currently-quarantined video can be rejected.
   */
  rejectQuarantinedVideo: (id: string, body: RejectQuarantinedVideoRequest = {}) =>
    apiRequest<void>(`/api/v1/admin/videos/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body,
    }),

  /**
   * GET /api/v1/admin/instance-settings — every runtime-mutable instance
   * setting's EFFECTIVE value with its config default and whether the database
   * currently overrides it (admin only). The DB-backed overlay behind the admin
   * configuration page.
   */
  getInstanceSettings: (signal?: AbortSignal) =>
    apiRequest<InstanceSettingsResponse>("/api/v1/admin/instance-settings", { signal }),

  /**
   * PATCH /api/v1/admin/instance-settings — partial, per-key-validated update
   * (admin only). The body is a flat map of setting key → new value (a boolean
   * for toggle keys, a string for text keys); a `null` value clears that
   * override (resets the key to its config default). Only the keys present are
   * changed. An unknown key / type mismatch / content-invalid value is 422 with
   * field errors and nothing is written. Returns the full effective document.
   */
  updateInstanceSettings: (patch: UpdateInstanceSettingsRequest) =>
    apiRequest<InstanceSettingsResponse>("/api/v1/admin/instance-settings", {
      method: "PATCH",
      body: patch,
    }),

  /**
   * POST /api/v1/admin/instance-avatar — set the instance's avatar (admin,
   * multipart, JPEG/PNG/WebP by extension; otherwise 415 — the same gate as
   * user/channel avatars). The GET /instance branding block reflects it
   * immediately (config-parity W1 endpoints, W4 consumers).
   */
  setInstanceAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>("/api/v1/admin/instance-avatar", {
      method: "POST",
      body: form,
    });
  },

  /** DELETE /api/v1/admin/instance-avatar — remove the instance avatar (admin; 404 when none set). */
  deleteInstanceAvatar: () =>
    apiRequest<void>("/api/v1/admin/instance-avatar", { method: "DELETE" }),

  /**
   * POST /api/v1/admin/instance-banner — set the instance's banner (admin,
   * multipart; same type gate as the avatar).
   */
  setInstanceBanner: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>("/api/v1/admin/instance-banner", {
      method: "POST",
      body: form,
    });
  },

  /** DELETE /api/v1/admin/instance-banner — remove the instance banner (admin; 404 when none set). */
  deleteInstanceBanner: () =>
    apiRequest<void>("/api/v1/admin/instance-banner", { method: "DELETE" }),

  /**
   * POST /api/v1/admin/instance-logo/{type} — set one typed instance logo slot
   * (admin, multipart; type ∈ favicon | header-wide | header-square |
   * opengraph — PeerTube LogoType parity; the opengraph slot doubles as the
   * social-card image).
   */
  setInstanceLogo: (type: InstanceLogoType, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ProfileImage>(`/api/v1/admin/instance-logo/${encodeURIComponent(type)}`, {
      method: "POST",
      body: form,
    });
  },

  /** DELETE /api/v1/admin/instance-logo/{type} — remove one typed logo slot (admin; 404 when unset). */
  deleteInstanceLogo: (type: InstanceLogoType) =>
    apiRequest<void>(`/api/v1/admin/instance-logo/${encodeURIComponent(type)}`, {
      method: "DELETE",
    }),

  /**
   * GET /api/v1/admin/instance-documents/{name} — one instance document's
   * stored state (admin only; config-parity W1 store, W6 editors). A document
   * that was never set comes back with body "" and hash "" — a stable shape
   * for the editors, never a 404.
   */
  getInstanceDocument: (name: InstanceDocumentName, signal?: AbortSignal) =>
    apiRequest<InstanceDocument>(
      `/api/v1/admin/instance-documents/${encodeURIComponent(name)}`,
      { signal },
    ),

  /**
   * PUT /api/v1/admin/instance-documents/{name} — store an instance document
   * (admin only; homepage capped at 100 KiB, custom CSS/JS at 200 KiB — an
   * over-cap body is a 422 with a `body` field error). An empty body CLEARS
   * the document. Every write is audit-enveloped server-side with the new
   * content hash.
   */
  putInstanceDocument: (name: InstanceDocumentName, body: string) =>
    apiRequest<InstanceDocument>(
      `/api/v1/admin/instance-documents/${encodeURIComponent(name)}`,
      { method: "PUT", body: { body } },
    ),

  /**
   * GET /api/v1/admin/jobs — durable job-queue operations snapshot (admin only):
   * per-queue depth by state (pending/running/done/failed) + the oldest
   * still-pending item's age, plus a merged recent-failures list. No secrets/URLs.
   */
  getJobs: (signal?: AbortSignal) => apiRequest<JobsOverview>("/api/v1/admin/jobs", { signal }),

  /**
   * GET /api/v1/admin/jobs/runs — individual unified executions, newest first.
   * Every filter is server-backed; metadata/error fields are already bounded and
   * sanitized by the backend before they reach this operator surface.
   */
  getJobRuns: (params: JobRunListParams = {}, signal?: AbortSignal) =>
    apiRequest<JobRunsResponse>("/api/v1/admin/jobs/runs", {
      query: {
        state: params.state,
        type: params.type,
        queue: params.queue,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        worker_id: params.workerId,
        failure: params.failure,
        created_after: params.createdAfter,
        created_before: params.createdBefore,
        limit: params.limit,
        offset: params.offset,
      },
      signal,
    }),

  /** GET /api/v1/admin/jobs/runs/{id} — one run plus paginated execution events. */
  getJobRun: (
    id: string,
    params: { eventsLimit?: number; eventsOffset?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<JobRunDetailResponse>(
      `/api/v1/admin/jobs/runs/${encodeURIComponent(id)}`,
      {
        query: {
          events_limit: params.eventsLimit,
          events_offset: params.eventsOffset,
        },
        signal,
      },
    ),

  /**
   * POST /api/v1/admin/media/gc — sweep stored media objects with no database
   * reference (admin only; audited). `dryRun` true (the default) reports the
   * would-delete orphan set without deleting; false actually deletes them.
   * 503 when the storage backend cannot list (GC unavailable).
   */
  runMediaGC: (dryRun: boolean) =>
    apiRequest<MediaGCResponse>("/api/v1/admin/media/gc", {
      method: "POST",
      body: { dry_run: dryRun },
    }),

  /**
   * POST /api/v1/admin/peertube-import — launch a one-way PeerTube→Vidra
   * migration run (admin only; audited). `mode` is "dry_run" (report the plan +
   * counts + conflicts, writes NOTHING) or "run" (perform the import);
   * `conflict_policy` (skip|rename|merge|fail, default skip server-side) resolves
   * handle/email/slug collisions. Returns the launched run (202) to poll. The
   * SOURCE database/storage connection is taken from SERVER CONFIG only — the
   * browser NEVER sends a DSN or credential. 409 if a run is already active; 503
   * when import is not configured on the instance.
   */
  launchPeerTubeImport: (body: PeerTubeImportLaunchRequest) =>
    apiRequest<PeerTubeImportRun>("/api/v1/admin/peertube-import", {
      method: "POST",
      body,
    }),

  /**
   * GET /api/v1/admin/peertube-import — recent import runs newest-first (admin
   * only): the import history plus the active run's live per-entity progress.
   */
  listPeerTubeImports: (signal?: AbortSignal) =>
    apiRequest<PeerTubeImportRunList>("/api/v1/admin/peertube-import", { signal }),

  /**
   * GET /api/v1/admin/peertube-import/{id} — one import run by id (admin only).
   * The progress-poll endpoint for a launched dry-run or import.
   */
  getPeerTubeImport: (id: string, signal?: AbortSignal) =>
    apiRequest<PeerTubeImportRun>(
      `/api/v1/admin/peertube-import/${encodeURIComponent(id)}`,
      { signal },
    ),
};

/**
 * Append a video-scoped playback token (CORE-17) as `?pt=<token>` — the
 * header-less credential path for the media URLs a `<video src>`/`<img>`/`fetch`
 * carries where an Authorization header cannot ride (Safari native-HLS,
 * progressive playback, poster, storyboard, captions). No-op without a token, so
 * every helper stays backward-compatible for a non-protected video. The token is
 * a secret — callers already keep it out of logs.
 */
function withPlaybackToken(url: string, pt?: string | null): string {
  if (!pt) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pt=${encodeURIComponent(pt)}`;
}

/** Direct URL to a video's original stream (for a <video> src). Range-capable. */
export function videoOriginalUrl(id: string, pt?: string | null): string {
  return withPlaybackToken(`${apiBaseUrl}/api/v1/videos/${encodeURIComponent(id)}/original`, pt);
}

/**
 * Direct URL to a video's HLS master playlist. Only meaningful once the detail
 * response carries `hls_url` (the readiness signal — the playlist 404s before
 * transcoding completes). The path is deterministic per the contract, matching
 * the detail's hls_url value.
 */
export function videoHlsMasterUrl(id: string, pt?: string | null): string {
  return withPlaybackToken(
    `${apiBaseUrl}/api/v1/videos/${encodeURIComponent(id)}/hls/master.m3u8`,
    pt,
  );
}

/**
 * Content-addressed URL to a video's IPFS-mirrored HLS master playlist, built
 * from the detail's `ipfs` object ({ gateway_url, hls_cid }). Returns null when
 * either field is absent (the video's HLS tree is not pinned / IPFS is off), so
 * a caller only offers IPFS playback when a real gateway CID exists — never a
 * fabricated one. The master lives at the root of the pinned HLS wrap-directory
 * CID; a client fetches it as plain HTTP from the public gateway.
 */
export function ipfsHlsMasterUrl(ipfs?: {
  gateway_url?: string;
  hls_cid?: string;
}): string | null {
  if (!ipfs?.gateway_url || !ipfs.hls_cid) return null;
  const base = ipfs.gateway_url.replace(/\/+$/, "");
  return `${base}/ipfs/${encodeURIComponent(ipfs.hls_cid)}/master.m3u8`;
}

/**
 * Direct URL to a live stream's HLS master playlist. Only meaningful while the
 * stream is live and a media server is serving it (the get response's `hls_url`
 * is the readiness signal — the playlist 404s otherwise). The path is
 * deterministic per the contract, matching the LiveStream.hls_url value.
 */
export function liveHlsMasterUrl(id: string): string {
  return `${apiBaseUrl}/api/v1/live/${encodeURIComponent(id)}/hls/master.m3u8`;
}

/** Direct URL to a video's poster image (for an <img> src). */
export function videoThumbnailUrl(id: string, pt?: string | null): string {
  return withPlaybackToken(`${apiBaseUrl}/api/v1/videos/${encodeURIComponent(id)}/thumbnail`, pt);
}

/**
 * Direct URL to a remote video's locally cached poster (for an <img> src).
 * 404s when no thumbnail was cached at ingestion — remote cards keep their
 * no-preview fallback in that case.
 */
export function remoteVideoThumbnailUrl(id: string): string {
  return `${apiBaseUrl}/api/v1/remote-videos/${encodeURIComponent(id)}/thumbnail`;
}

/** Direct URL to a caption track's WebVTT body (text/vtt). */
export function videoCaptionUrl(id: string, language: string, pt?: string | null): string {
  return withPlaybackToken(
    `${apiBaseUrl}/api/v1/videos/${encodeURIComponent(id)}/captions/${encodeURIComponent(language)}`,
    pt,
  );
}

/** Direct URL to a video's storyboard WebVTT map (seek-preview cues). */
export function videoStoryboardVttUrl(id: string, pt?: string | null): string {
  return withPlaybackToken(
    `${apiBaseUrl}/api/v1/videos/${encodeURIComponent(id)}/storyboard.vtt`,
    pt,
  );
}

/** Direct URL to a video's storyboard sprite sheet (for the seek-preview thumbnails). */
export function videoStoryboardImageUrl(id: string, pt?: string | null): string {
  return withPlaybackToken(
    `${apiBaseUrl}/api/v1/videos/${encodeURIComponent(id)}/storyboard.jpg`,
    pt,
  );
}

/** Direct URL to a playlist's cover image (for an <img> src; 404s when none set). */
export function playlistThumbnailUrl(id: string): string {
  return `${apiBaseUrl}/api/v1/playlists/${encodeURIComponent(id)}/thumbnail`;
}

/** Direct URL to a user's public avatar image (404s when none is set). */
export function userAvatarUrl(userId: string): string {
  return `${apiBaseUrl}/api/v1/users/${encodeURIComponent(userId)}/avatar`;
}

/** Direct URL to a user's public profile banner image (404s when none is set). */
export function userBannerUrl(userId: string): string {
  return `${apiBaseUrl}/api/v1/users/${encodeURIComponent(userId)}/banner`;
}

/** Direct URL to a channel's public avatar image (404s when none is set). */
export function channelAvatarUrl(handle: string): string {
  return `${apiBaseUrl}/api/v1/channels/${encodeURIComponent(handle)}/avatar`;
}

/** Direct URL to a channel's public banner image (404s when none is set). */
export function channelBannerUrl(handle: string): string {
  return `${apiBaseUrl}/api/v1/channels/${encodeURIComponent(handle)}/banner`;
}
