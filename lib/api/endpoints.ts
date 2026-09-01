import { apiBaseUrl } from "@/lib/config";
import { searchSessionHeaders } from "@/lib/search-session";

import { getAccessToken } from "./auth-store";
import { ApiError, apiRequest } from "./client";
import { pageQuery, type PageParams } from "./pagination";
import { uploadWithProgress, type UploadProgress } from "./upload";
import type { SearchEventInput } from "./types";
import type {
  AdminCommentListResponse,
  AdminStats,
  AdminUser,
  AdminUserListResponse,
  AuditLogListResponse,
  InstanceDocument,
  InstanceDocumentName,
  InstanceSettingsResponse,
  InstanceSettingsValidationResponse,
  InfrastructureStatus,
  MailTestResult,
  UpdateInstanceSettingsRequest,
  InstanceAboutResponse,
  InstanceContactRequest,
  JobsOverview,
  JobRunDetailResponse,
  JobRunsResponse,
  JobRunState,
  IPFSReconcileResult,
  IPFSStatus,
  MediaGCAdoptBucketResponse,
  MediaGCConfig,
  MediaGCResponse,
  QoEPlaybackHealth,
  PeerTubeImportLaunchRequest,
  PeerTubeImportRun,
  PeerTubeImportRunList,
  StorageMigration,
  StorageMigrationList,
  SystemStatus,
  AdminVideoListResponse,
  AdminVideoScope,
  AdminVideoSort,
  BlockedRemoteVideoListResponse,
  BlockedVideoListResponse,
  BlockVideoRequest,
  Caption,
  CaptionListResponse,
  Channel,
  ChannelListResponse,
  PublicUserProfile,
  ChannelSyncListResponse,
  ChannelSyncResponse,
  CreateChannelSyncRequest,
  FederationFollowerRequestListResponse,
  FollowedChannelsResponse,
  FollowNotificationsResponse,
  NotificationSetting,
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
  MessagingPrefs,
  UpdateMessagingPrefsRequest,
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
  PlaybackSession,
  QoEEventInput,
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
  AccountStatsResponse,
  ChannelMember,
  ChannelMembersResponse,
  AddChannelMemberRequest,
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
  RegistrationRequestFilter,
  RegistrationRequestListResponse,
  RejectRegistrationRequest,
  ReportListResponse,
  ReportStatusFilter,
  ResolveReportRequest,
  UnreadCountResponse,
  UpdateUserRequest,
  UpdatePlaylistRequest,
  UpdateVideoRequest,
  UploadVideoResult,
  CreateUploadSessionRequest,
  UploadSessionResponse,
  UploadStatusResponse,
  VideoPrivacy,
  VideoState,
  ActiveUploadsResponse,
  ImportJobResponse,
  ImportResolver,
  VideoFile,
  VideoRating,
  VideoStatsResponse,
  VideoSearchResponse,
  AccountSearchResponse,
  ChannelSearchResponse,
  SearchSuggestionsResponse,
  RecommendationsResponse,
  SearchHistoryResponse,
  SuggestionBanListResponse,
  SuggestionBanResponse,
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
 * Params for GET /videos/search: pagination plus the optional facets the search
 * page exposes (category/language/license ids come from GET /videos/config; tags are
 * free-form lowercased tags). The taxonomy and tag filters narrow to LOCAL
 * results (federated remote cards are excluded when set); the duration and
 * publish-window bounds apply to local and remote alike.
 *
 * Anything other than the default relevance sort — and any of the duration /
 * publish / multi-tag facets — makes the backend serve the request from local
 * SQL rather than the search service, which is where those predicates are real.
 * That is the backend's decision, not something the caller opts into.
 */
export interface SearchVideosParams extends SearchParams {
  tag?: string;
  category?: string;
  language?: string;
  /** Taxonomy licence id (GET /videos/config; unknown → 422). */
  license?: string;
  /** Ordering; omit for the endpoint's own relevance default. */
  sort?: string;
  /** Inclusive length bounds, in SECONDS. A video with no known duration matches neither. */
  durationMin?: number;
  durationMax?: number;
  /** Inclusive RFC3339 publish window. An inverted window is a 400, not an empty page. */
  publishedAfter?: string;
  publishedBefore?: string;
  /** Comma-separated tag lists: every tag / at least one tag. */
  tagsAllOf?: string;
  tagsOneOf?: string;
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
        ...pageQuery(params),
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
   * POST /api/v1/videos/{id}/playback-session — the one call the player makes
   * before it plays (phase-4 delivery item 1). Answers which manifests exist,
   * the packaging format they describe, the ladder rungs, a session id for
   * quality telemetry, and — ONLY for a video that cannot be played without one
   * (privacy `password`) — a playback token.
   *
   * Authorization is identical to the media routes, so `token` is the same
   * video-scoped playback token the unlock flow mints: an invisible video is
   * 404 and a password-protected video without a credential is 401
   * `password_required`, which is exactly what the watch/embed unlock prompt is
   * already driven by.
   */
  createVideoPlaybackSession: (id: string, token?: string, signal?: AbortSignal) =>
    apiRequest<PlaybackSession>(
      `/api/v1/videos/${encodeURIComponent(id)}/playback-session`,
      { method: "POST", token, signal },
    ),

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
   * filters (category/language/license/tag) narrow results to local videos; an
   * unknown category/language/license value is a 422 (the selects are populated
   * from the same GET /videos/config taxonomy, so the UI never sends one).
   */
  searchVideos: (query: string, params: SearchVideosParams = {}, signal?: AbortSignal) =>
    apiRequest<VideoSearchResponse>("/api/v1/videos/search", {
      query: {
        q: query,
        ...pageQuery(params),
        tag: params.tag,
        category: params.category,
        language: params.language,
        license: params.license,
        sort: params.sort,
        duration_min: params.durationMin,
        duration_max: params.durationMax,
        published_after: params.publishedAfter,
        published_before: params.publishedBefore,
        tags_all_of: params.tagsAllOf,
        tags_one_of: params.tagsOneOf,
      },
      signal,
    }),

  /**
   * GET /api/v1/search/channels?q= — fuzzy channel search over handles and
   * display names, ranked by similarity then follower count. Backed by core's
   * own Postgres rather than the search service: the index holds videos, so a
   * channel that has published nothing is invisible to it — and "find the
   * channel that was just created" is exactly what a channel search is asked.
   * Optional auth (a signed-in caller's muted/blocked accounts drop out, and the
   * reported total is counted under the same predicate).
   */
  searchChannels: (query: string, params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<ChannelSearchResponse>("/api/v1/search/channels", {
      query: { q: query, ...pageQuery(params) },
      signal,
    }),

  /**
   * GET /api/v1/search/accounts?q= — fuzzy account search over usernames and
   * display names. Returns only accounts that are active, have opted their
   * profile in, and have not opted out of discovery; the total is counted under
   * the identical predicate, so it can never leak the existence of an account
   * the list refuses to return. Optional auth.
   */
  searchAccounts: (query: string, params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<AccountSearchResponse>("/api/v1/search/accounts", {
      query: { q: query, ...pageQuery(params) },
      signal,
    }),

  /**
   * GET /api/v1/search/suggestions?q= — autocomplete suggestions from the search
   * service (search-service W4). Always 200: a disabled service, an empty query,
   * a timeout, or any error degrades to an empty list — a suggestion box never
   * errors. Carries the anonymous X-Vidra-Session header so the service can
   * correlate a session's typing without an account. Optional auth.
   */
  getSearchSuggestions: (
    query: string,
    params: { limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<SearchSuggestionsResponse>("/api/v1/search/suggestions", {
      query: { q: query, limit: params.limit },
      headers: searchSessionHeaders(),
      signal,
    }),

  /**
   * GET /api/v1/recommendations/home?limit= — the "For you" / "Trending now"
   * home rail. Personalized when the instance + user allow it and the caller is
   * signed in; otherwise the trending feed (source="fallback"). Never errors.
   */
  getHomeRecommendations: (params: { limit?: number } = {}, signal?: AbortSignal) =>
    apiRequest<RecommendationsResponse>("/api/v1/recommendations/home", {
      query: { limit: params.limit },
      headers: searchSessionHeaders(),
      signal,
    }),

  /**
   * GET /api/v1/videos/{id}/recommendations?limit= — the related-videos rail for
   * a watch page. Falls back server-side to a same-channel + same-category
   * heuristic when the search service is unavailable. Optional auth.
   */
  getVideoRecommendations: (
    id: string,
    params: { limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<RecommendationsResponse>(
      `/api/v1/videos/${encodeURIComponent(id)}/recommendations`,
      {
        query: { limit: params.limit },
        headers: searchSessionHeaders(),
        signal,
      },
    ),

  /**
   * POST /api/v1/search/events — record a batch (≤20) of behavioural
   * search/discovery events. Core enriches each with the caller's user id,
   * session, and history policy, then enqueues them; it never blocks on the
   * search service (202). Best-effort: fire-and-forget from lib/search-events.
   * `keepalive` lets a flush survive a page unload/visibility change.
   */
  postSearchEvents: (
    events: readonly SearchEventInput[],
    opts: { keepalive?: boolean } = {},
  ) =>
    apiRequest<void>("/api/v1/search/events", {
      method: "POST",
      body: { events },
      headers: searchSessionHeaders(),
      keepalive: opts.keepalive,
    }),

  /**
   * POST /api/v1/qoe/events — record a batch (≤20) of playback quality
   * measurements (phase-4 delivery item 4). Optional auth; validation is
   * all-or-nothing; always 202 on a well-formed batch whether or not a row
   * landed. Best-effort: fire-and-forget from lib/playback-qoe.ts, which is the
   * only caller. `keepalive` lets a flush survive a page unload.
   *
   * The browse `X-Vidra-Session` header the search beacon sends is deliberately
   * NOT sent here: this endpoint correlates on the playback session id, and a
   * second identifier it does not read would be identity it did not ask for.
   */
  postQoEEvents: (events: readonly QoEEventInput[], opts: { keepalive?: boolean } = {}) =>
    apiRequest<void>("/api/v1/qoe/events", {
      method: "POST",
      body: { events },
      keepalive: opts.keepalive,
    }),

  /**
   * GET /api/v1/me/search-history — the caller's stored search history (auth).
   * Answers 503 search_unavailable (ApiError code "search_unavailable") when the
   * search service is disabled or unreachable — never a fake empty history, so
   * the settings UI can tell "no history" from "temporarily unavailable".
   */
  getSearchHistory: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<SearchHistoryResponse>("/api/v1/me/search-history", {
      query: pageQuery(params),
      signal,
    }),

  /** DELETE /api/v1/me/search-history — clear the caller's entire history (auth). */
  clearSearchHistory: () =>
    apiRequest<void>("/api/v1/me/search-history", { method: "DELETE" }),

  /**
   * DELETE /api/v1/me/search-history/{query} — remove one normalized query from
   * the caller's history (auth). The query is path-escaped.
   */
  deleteSearchHistoryEntry: (query: string) =>
    apiRequest<void>(
      `/api/v1/me/search-history/${encodeURIComponent(query)}`,
      { method: "DELETE" },
    ),

  /** GET /api/v1/channels/{handle} — channel by handle. */
  getChannel: (handle: string, signal?: AbortSignal) =>
    apiRequest<Channel>(`/api/v1/channels/${encodeURIComponent(handle)}`, { signal }),

  /** GET /api/v1/users/{username}/profile — public profile or owner preview. */
  getUserProfile: (username: string, signal?: AbortSignal) =>
    apiRequest<PublicUserProfile>(
      `/api/v1/users/${encodeURIComponent(username)}/profile`,
      { signal },
    ),

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

  /**
   * PUT /api/v1/channels/{handle}/follow/notifications — the per-channel bell
   * for a channel the caller already follows (auth): "all" = told about every
   * new public video, "none" = subscription kept, notifications muted. Core
   * starts every new follow at "all", so without this call a follower's only
   * escape is the account-wide switch — all channels or none.
   *
   * Returns the STORED mode; callers adopt the response rather than assuming
   * the value they sent. 404 = unknown channel or the caller does not follow it.
   */
  setFollowNotifications: (handle: string, notificationSetting: NotificationSetting) =>
    apiRequest<FollowNotificationsResponse>(
      `/api/v1/channels/${encodeURIComponent(handle)}/follow/notifications`,
      { method: "PUT", body: { notification_setting: notificationSetting } },
    ),

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
   * GET /api/v1/me/stats — account-level analytics rollup across every channel
   * the caller OWNS (auth, owner-scoped by construction): engagement totals, the
   * aggregated 30-day daily-views series (field `day`, zero-filled, oldest
   * first), and a per-channel breakdown (views, followers, videos, views_28d).
   * Drives the studio "All channels" analytics scope.
   */
  getMyStats: (signal?: AbortSignal) =>
    apiRequest<AccountStatsResponse>("/api/v1/me/stats", { signal }),

  /**
   * GET /api/v1/me/player-settings — the caller's effective player defaults
   * (PLAY-07, auth): autoplay_next, default_speed, default_quality,
   * captions_default, theater_default, and video_card_previews_enabled. Always
   * 200 with the full object (a user who never saved gets the built-in
   * defaults). The app shell hydrates it for both watch and browse surfaces.
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
   * GET /api/v1/channels/{handle}/members — the channel's editor collaborators
   * (auth; visible to the owner and existing members, else 403; unknown handle
   * 404). Powers the Studio Channel-tab collaborators list.
   */
  listChannelMembers: (handle: string, signal?: AbortSignal) =>
    apiRequest<ChannelMembersResponse>(
      `/api/v1/channels/${encodeURIComponent(handle)}/members`,
      { signal },
    ),

  /**
   * POST /api/v1/channels/{handle}/members — invite a local user as an editor of
   * the channel (auth, owner only). The target is identified by their handle
   * (username). 404 when the channel or the target user is unknown; 409 when the
   * target already owns or is a member of the channel.
   */
  addChannelMember: (handle: string, body: AddChannelMemberRequest) =>
    apiRequest<ChannelMember>(
      `/api/v1/channels/${encodeURIComponent(handle)}/members`,
      { method: "POST", body },
    ),

  /**
   * DELETE /api/v1/channels/{handle}/members/{userId} — remove a collaborator
   * (auth, owner only; idempotent 204). Unknown handle 404.
   */
  removeChannelMember: (handle: string, userId: string) =>
    apiRequest<void>(
      `/api/v1/channels/${encodeURIComponent(handle)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),

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
   * GET /api/v1/uploads/{upload_id} — the resume contract (which chunk indices
   * have landed) AND the session's lifecycle state (owner only). Read after an
   * interruption to skip received chunks, and polled after the completion POST
   * answers 202 until `state` is "completed" or "failed".
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
   * POST /api/v1/uploads/{upload_id}/complete — ACCEPT the completion (auth,
   * owner). Answers 202 with the session's state; the assembly and the publish
   * pipeline run on a queue, because doing them inline meant minutes of work
   * inside a 30s request deadline (behind a CDN that caps origin response time),
   * which is why every real upload used to fail at 100%.
   *
   * Poll `getUploadSession` until state is "completed" — then read the video for
   * its outcome — or "failed" (failure_reason explains it). Idempotent: a repeat
   * POST returns the current state without re-queueing.
   */
  completeUploadSession: (uploadId: string) =>
    apiRequest<UploadStatusResponse>(`/api/v1/uploads/${encodeURIComponent(uploadId)}/complete`, {
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
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<LivePublicListResponse>("/api/v1/live", {
      query: pageQuery(params),
      signal,
    }),

  /**
   * GET /api/v1/live/{id} — a single live stream's public metadata (the watch
   * surface). A private stream is visible only to its owner (else 404). While
   * live, the response carries `hls_url`; the stream key is never returned.
   */
  getLiveStream: (id: string, signal?: AbortSignal) =>
    apiRequest<LiveStream>(`/api/v1/live/${encodeURIComponent(id)}`, { signal }),

  /**
   * POST /api/v1/live/{id}/playback-session — the live half of the session model
   * (phase-4 delivery item 7). Same object as the video session, carrying
   * `live_stream_id` instead of `video_id`, `packaging_format` `hls-ts`, the live
   * playlist URL, and — only for a PRIVATE stream — a playback token. That token
   * is the only revocable, expiring credential live has; a public stream gets
   * none, and none must be sent.
   */
  createLivePlaybackSession: (id: string, signal?: AbortSignal) =>
    apiRequest<PlaybackSession>(
      `/api/v1/live/${encodeURIComponent(id)}/playback-session`,
      { method: "POST", signal },
    ),

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
      query: pageQuery(params),
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
      query: pageQuery(params),
      signal,
    }),

  /** GET /api/v1/videos/{id}/comments — a public video's comments, newest first. */
  getVideoComments: (id: string, params: SearchParams = {}, signal?: AbortSignal) =>
    apiRequest<CommentListResponse>(
      `/api/v1/videos/${encodeURIComponent(id)}/comments`,
      { query: pageQuery(params), signal },
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

  /**
   * PUT /api/v1/comments/{id}/pin — pin a top-level comment as the video's
   * single creator-pinned comment (auth; creator/editor/moderator only,
   * enforced server-side). Pinning replaces any existing pin atomically. Only a
   * top-level, non-tombstoned comment can be pinned (422 otherwise). Returns the
   * updated comment.
   */
  pinComment: (id: string) =>
    apiRequest<Comment>(`/api/v1/comments/${encodeURIComponent(id)}/pin`, { method: "PUT" }),

  /**
   * DELETE /api/v1/comments/{id}/pin — clear the video's pin when this comment
   * is the current pinned one (auth; same authorization as pin; a no-op on a
   * comment that isn't pinned). Returns the updated comment.
   */
  unpinComment: (id: string) =>
    apiRequest<Comment>(`/api/v1/comments/${encodeURIComponent(id)}/pin`, { method: "DELETE" }),

  /**
   * PUT /api/v1/comments/{id}/heart — add the creator heart to a comment (auth;
   * creator/editor/moderator only). Works at any depth, on replies and
   * remote-authored comments too. Returns the updated comment.
   */
  heartComment: (id: string) =>
    apiRequest<Comment>(`/api/v1/comments/${encodeURIComponent(id)}/heart`, { method: "PUT" }),

  /**
   * DELETE /api/v1/comments/{id}/heart — remove the creator heart from a comment
   * (auth; same authorization as heart). Returns the updated comment.
   */
  unheartComment: (id: string) =>
    apiRequest<Comment>(`/api/v1/comments/${encodeURIComponent(id)}/heart`, { method: "DELETE" }),

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
  getMutedAccounts: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<MutedAccountListResponse>("/api/v1/me/mutes/accounts", {
      query: pageQuery(params),
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
  getMutedInstances: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<MutedInstanceListResponse>("/api/v1/me/mutes/instances", {
      query: pageQuery(params),
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
  listRemoteFollows: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<RemoteFollowListResponse>("/api/v1/me/remote-follows", {
      query: pageQuery(params),
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
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<BlockedInstanceListResponse>("/api/v1/admin/instances/blocked", {
      query: pageQuery(params),
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
  getBlockedUsers: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<BlockedUserListResponse>("/api/v1/me/blocks", {
      query: pageQuery(params),
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
  getConversations: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<ConversationListResponse>("/api/v1/me/conversations", {
      query: pageQuery(params),
      signal,
    }),

  /**
   * GET /api/v1/conversations/{id}/messages — a conversation's messages, newest
   * first (auth). A non-participant (or unknown conversation) is 404.
   */
  getMessages: (
    conversationId: string,
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<MessageListResponse>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      { query: pageQuery(params), signal },
    ),

  /**
   * GET /api/v1/conversations/{id}/messages — a conversation's messages, newest
   * first (auth). Returns a MessageListResponse for a plaintext conversation and
   * an EncryptedMessageListResponse for an encrypted one (branch on which key is
   * present). A non-participant (or unknown conversation) is 404.
   *
   * `before_id` is the keyset cursor for paging UPWARD through history: the page
   * is the messages strictly older than that message, newest first, ordered on
   * `(created_at, id)` so it does not shift as new messages arrive. Encrypted
   * threads page identically. Two traps the backend enforces with a 422:
   * before_id may NOT be combined with `offset` (the check is on the param being
   * PRESENT, so even `offset=0` trips it — pass limit only), and the cursor must
   * be a message of this conversation that is addressed to one of the caller's
   * own devices. The response carries no total or has_more: a short page (fewer
   * than `limit` rows) is the only signal that history is exhausted.
   */
  getConversationMessages: (
    conversationId: string,
    params: PageParams & { before_id?: string } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<MessageListResponse | EncryptedMessageListResponse>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      { query: { ...pageQuery(params), before_id: params.before_id }, signal },
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
   * GET /api/v1/me/messaging-prefs — the caller's DM privacy toggles (auth).
   * `read_receipts` defaults to TRUE server-side, so a fresh account is already
   * telling its peers when it read them.
   */
  getMessagingPrefs: (signal?: AbortSignal) =>
    apiRequest<MessagingPrefs>("/api/v1/me/messaging-prefs", { signal }),

  /**
   * PATCH /api/v1/me/messaging-prefs — change the caller's DM privacy toggles
   * (auth); only the fields present are touched. Returns the full updated prefs,
   * so callers should adopt the response rather than assume the sent value.
   * With `read_receipts: false` core stops exposing the caller's read watermark
   * to peers — one-way: it does not hide the peer's watermark from the caller.
   */
  updateMessagingPrefs: (body: UpdateMessagingPrefsRequest) =>
    apiRequest<MessagingPrefs>("/api/v1/me/messaging-prefs", { method: "PATCH", body }),

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
      query: pageQuery(params),
      signal,
    }),

  /** POST /api/v1/videos/{id}/save — save a video to your library (auth, idempotent). */
  saveVideo: (id: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/save`, { method: "POST" }),

  /** DELETE /api/v1/videos/{id}/save — remove a video from your library (auth, idempotent). */
  unsaveVideo: (id: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/save`, { method: "DELETE" }),

  /**
   * GET /api/v1/me/history — the caller's watch history as cards, newest-watched
   * first (auth). `progress: "in_progress"` narrows the list to the
   * "Continue watching" subset server-side (started, not effectively finished);
   * omitting it returns the full history (Wave A3 / Wave C5).
   */
  getWatchHistory: (
    params: SearchParams & { progress?: "in_progress" } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<WatchHistoryResponse>("/api/v1/me/history", {
      query: { ...pageQuery(params), progress: params.progress },
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

  /**
   * POST /api/v1/videos/{id}/view — count a view for a video (optional auth;
   * always 204). The server owns the policy: it dedups per viewer and no-ops for
   * a non-published video, so there is no client-side threshold. Fired once per
   * watched video from the player's first play signal (see WatchView); it is
   * best-effort telemetry, so callers swallow failures.
   */
  recordVideoView: (id: string) =>
    apiRequest<void>(`/api/v1/videos/${encodeURIComponent(id)}/view`, {
      method: "POST",
    }),

  /** DELETE /api/v1/me/history/{id} — remove one video from history (auth, idempotent). */
  deleteHistoryEntry: (id: string) =>
    apiRequest<void>(`/api/v1/me/history/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** DELETE /api/v1/me/history — clear the caller's entire watch history (auth, idempotent). */
  clearWatchHistory: () => apiRequest<void>("/api/v1/me/history", { method: "DELETE" }),

  /** GET /api/v1/me/notifications — the caller's notifications + unread count (auth). */
  getNotifications: (
    params: PageParams & { unread?: boolean } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<NotificationListResponse>("/api/v1/me/notifications", {
      query: { unread: params.unread, ...pageQuery(params) },
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
   * GET /api/v1/admin/reports — the moderation queue, newest first
   * (moderator/admin), with a `total` counting the reports that match the same
   * status.
   *
   * `status` is a real three-way enum: "open" (unresolved), "resolved"
   * (accepted or rejected), or "all" — which is also what omitting it means. It
   * used to be a boolean spelled as "send status=open or send nothing", so
   * `?status=resolved` silently returned the entire queue; the backend now
   * rejects an unrecognised value with a 400 instead of quietly widening it.
   */
  getReports: (
    params: PageParams & { status?: ReportStatusFilter } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<ReportListResponse>("/api/v1/admin/reports", {
      query: {
        status: params.status,
        ...pageQuery(params),
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
    params: PageParams & { q?: string } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AdminUserListResponse>("/api/v1/admin/users", {
      query: { q: params.q, ...pageQuery(params) },
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
   * newest first (admin only), with a `total` counting the requests that match
   * the same status.
   *
   * `status` is the full lifecycle enum — "pending", "approved", "rejected", or
   * "all" (also what omitting it means). It previously accepted only "pending"
   * in practice: any other value fell through to "everything", so "show me the
   * rejected applications" was unaskable.
   */
  getRegistrationRequests: (
    params: PageParams & { status?: RegistrationRequestFilter } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<RegistrationRequestListResponse>("/api/v1/admin/registration-requests", {
      query: { status: params.status, ...pageQuery(params) },
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
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<FederationFollowerRequestListResponse>(
      "/api/v1/admin/federation/follower-requests",
      { query: pageQuery(params), signal },
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
    params: PageParams & { action?: string } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AuditLogListResponse>("/api/v1/admin/audit-log", {
      query: { action: params.action, ...pageQuery(params) },
      signal,
    }),

  /** GET /api/v1/admin/system — operational status snapshot (admin). */
  getSystemStatus: (signal?: AbortSignal) =>
    apiRequest<SystemStatus>("/api/v1/admin/system", { signal }),

  /**
   * GET /api/v1/admin/infrastructure — the deploy-time shape of this instance
   * (admin only): server limits, storage backend, networking, backup guidance,
   * and the optional-feature discovery list. Read-only and secret-free by
   * construction — no DSN, no S3 keys, no SMTP credentials ever appear in it.
   * Complements getSystemStatus: that one answers "is it healthy right now",
   * this one answers "what did the operator actually deploy".
   */
  getInfrastructure: (signal?: AbortSignal) =>
    apiRequest<InfrastructureStatus>("/api/v1/admin/infrastructure", { signal }),

  /**
   * GET /api/v1/admin/storage/migrations — media-store migration campaign
   * history, newest first (admin only). Read-only on purpose: starting and
   * cancelling a campaign are CLI/ops actions (core docs/operations.md,
   * "Moving the media store"), because a move is bracketed by an environment
   * swap and a restart that no browser button can perform.
   */
  getStorageMigrations: (signal?: AbortSignal) =>
    apiRequest<StorageMigrationList>("/api/v1/admin/storage/migrations", { signal }),

  /**
   * GET /api/v1/admin/storage/migrations/{id} — one campaign (admin only).
   * The single-campaign view is the only one that carries the per-state
   * `objects` breakdown; the list omits it.
   */
  getStorageMigration: (id: string, signal?: AbortSignal) =>
    apiRequest<StorageMigration>(
      `/api/v1/admin/storage/migrations/${encodeURIComponent(id)}`,
      { signal },
    ),

  /**
   * GET /api/v1/admin/qoe/playback-health — playback quality for a window,
   * read entirely from the hourly rollups (phase-4 delivery item 4; admin only).
   *
   * Called with NO parameters it answers the phase-4 exit criterion directly —
   * "TTFF/rebuffer percentiles per source for the last 24h" — so the admin
   * page's default view is the criterion itself. `since`/`until` are RFC3339
   * and are snapped to hour boundaries server-side (that is the resolution the
   * rollups exist at); a window wider than 7 days is a 422.
   *
   * limit/offset page `buckets` (the hourly detail) only. `sources` is a
   * summary over the whole window and is never paged.
   */
  getPlaybackHealth: (
    params: PageParams & { since?: string; until?: string } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<QoEPlaybackHealth>("/api/v1/admin/qoe/playback-health", {
      query: {
        since: params.since,
        until: params.until,
        ...pageQuery(params),
      },
      signal,
    }),

  /**
   * POST /api/v1/admin/mail/test — send one outbound-mail probe (admin only).
   * No request body and no recipient parameter: the server sends to the
   * instance's own contact address, so the button cannot be turned into an
   * open relay. 202 means the relay accepted the message, not that it was
   * delivered. 503 = no mail path configured, 409 = no contact address set,
   * 502 = the relay refused, 429 = throttled (its own small budget).
   */
  sendTestMail: () =>
    apiRequest<MailTestResult>("/api/v1/admin/mail/test", { method: "POST" }),

  /** GET /api/v1/ipfs/status — effective public/private mirror health and pin counts (admin). */
  getIPFSStatus: (signal?: AbortSignal) =>
    apiRequest<IPFSStatus>("/api/v1/ipfs/status", { signal }),

  /**
   * POST /api/v1/admin/ipfs/reconcile — re-arm failed work and seed missing
   * eligible pin intents. Omit network to reconcile both configured swarms.
   */
  reconcileIPFS: (network?: "public" | "private") =>
    apiRequest<IPFSReconcileResult>("/api/v1/admin/ipfs/reconcile", {
      method: "POST",
      query: { network },
    }),

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
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<BlockedVideoListResponse>("/api/v1/admin/videos/blocked", {
      query: pageQuery(params),
      signal,
    }),

  /**
   * GET /api/v1/admin/remote-videos/blocked — currently-blocked federated
   * remote videos, newest block first (moderator/admin). Paginated via
   * limit/offset.
   */
  getBlockedRemoteVideos: (
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<BlockedRemoteVideoListResponse>("/api/v1/admin/remote-videos/blocked", {
      query: pageQuery(params),
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
   * GET /api/v1/admin/videos — the local + federated video inventory (any
   * privacy/state) with each row's block status and media facts
   * (moderator/admin), plus a `total` counting everything the SAME filters
   * match. Every filter is optional and they intersect.
   *
   * Two shapes worth knowing at the call site:
   *
   *  - `state` and `privacy` are repeatable arrays. The backend accepts the
   *    repeated form and the comma-separated form as equivalent, and the shared
   *    query builder only serialises scalars, so they go out comma-joined.
   *  - `hasOriginal` / `hasHls` / `hasWebFiles` are TRI-STATE. `undefined` omits
   *    the parameter and means "all"; `false` is a real filter meaning "the ones
   *    without". Collapsing that to a plain boolean would make "videos with no
   *    HLS" unaskable.
   *
   * There is deliberately no storage filter: `object_storage` is derived from
   * the instance-wide backend rather than per-file truth, so it is identical on
   * every local row and filtering on it would answer nothing.
   */
  getAdminVideos: (
    params: {
      q?: string;
      sort?: AdminVideoSort;
      state?: readonly VideoState[];
      privacy?: readonly VideoPrivacy[];
      scope?: AdminVideoScope;
      channel?: string;
      publishedAfter?: string;
      publishedBefore?: string;
      hasOriginal?: boolean;
      hasHls?: boolean;
      hasWebFiles?: boolean;
      limit?: number;
      offset?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AdminVideoListResponse>("/api/v1/admin/videos", {
      query: {
        q: params.q,
        sort: params.sort,
        state: params.state?.length ? params.state.join(",") : undefined,
        privacy: params.privacy?.length ? params.privacy.join(",") : undefined,
        scope: params.scope,
        channel: params.channel,
        published_after: params.publishedAfter,
        published_before: params.publishedBefore,
        has_original: params.hasOriginal,
        has_hls: params.hasHls,
        has_web_files: params.hasWebFiles,
        ...pageQuery(params),
      },
      signal,
    }),

  /** POST /admin/videos/{id}/transcoding — moderator/admin recovery transcode from the retained original. */
  runVideoTranscoding: (id: string, type: "hls" | "web_video") =>
    apiRequest<{ status: "queued"; type: "hls" | "web_video" }>(
      `/api/v1/admin/videos/${encodeURIComponent(id)}/transcoding`,
      { method: "POST", body: { type } },
    ),

  /**
   * GET /api/v1/admin/comments — all comments newest first, each with its author
   * and the video it's on (moderator/admin). Optional `q` filters by body.
   */
  getAdminComments: (
    params: PageParams & { q?: string } = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<AdminCommentListResponse>("/api/v1/admin/comments", {
      query: { q: params.q, ...pageQuery(params) },
      signal,
    }),

  /** GET /api/v1/admin/watched-words — the watched-words list, newest first (moderator/admin). */
  getWatchedWords: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<WatchedWordListResponse>("/api/v1/admin/watched-words", {
      query: pageQuery(params),
      signal,
    }),

  /** GET /api/v1/admin/watched-word-matches — comments flagged by a watched term (mod/admin). */
  getWatchedWordMatches: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<WatchedWordMatchListResponse>("/api/v1/admin/watched-word-matches", {
      query: pageQuery(params),
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
   * GET /api/v1/admin/search/suggestion-bans — queries suppressed from
   * instance-wide autosuggest (moderator/admin).
   *
   * The envelope is `entries` + `limit` + `offset` and carries NO total, so a
   * caller can page but can never say how many bans exist. 403 `feature_disabled`
   * means smart search is off; 503 `search_unavailable` means the search service
   * is unreachable or not configured. They are different states and read
   * differently — see `describeSuggestionBanFailure`.
   */
  listSuggestionBans: (params: PageParams = {}, signal?: AbortSignal) =>
    apiRequest<SuggestionBanListResponse>("/api/v1/admin/search/suggestion-bans", {
      query: pageQuery(params),
      signal,
    }),

  /**
   * PUT /api/v1/admin/search/suggestion-bans/{query} — ban a query from
   * autosuggest (moderator/admin, idempotent). The search service normalizes the
   * key, so the response's `normalized_query` — NOT the string sent — is what a
   * later unban must target; surface it rather than echoing the input.
   */
  banSuggestion: (query: string) =>
    apiRequest<SuggestionBanResponse>(
      `/api/v1/admin/search/suggestion-bans/${encodeURIComponent(query)}`,
      { method: "PUT" },
    ),

  /**
   * DELETE /api/v1/admin/search/suggestion-bans/{query} — lift a ban
   * (moderator/admin, idempotent, 204). Pass the entry's `normalized_query`.
   */
  unbanSuggestion: (query: string) =>
    apiRequest<void>(
      `/api/v1/admin/search/suggestion-bans/${encodeURIComponent(query)}`,
      { method: "DELETE" },
    ),

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
    params: PageParams = {},
    signal?: AbortSignal,
  ) =>
    apiRequest<QuarantinedVideoListResponse>("/api/v1/admin/videos/quarantined", {
      query: pageQuery(params),
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
   * POST /api/v1/admin/instance-settings/validate — "would the PATCH accept
   * this?" without writing anything (admin only). Same body as the PATCH; the
   * answer is ALWAYS 200, because field problems are the result of asking a
   * validation question, not an error. `fields` is never null: empty means the
   * same body would be accepted. Lets the config form check a value against the
   * server's own rules as the operator leaves the field, instead of keeping a
   * hand-copied second copy of them here — a copy drifts the first time either
   * side changes, and the operator only finds out as a 422 on save.
   */
  validateInstanceSettings: (
    patch: UpdateInstanceSettingsRequest,
    signal?: AbortSignal,
  ) =>
    apiRequest<InstanceSettingsValidationResponse>(
      "/api/v1/admin/instance-settings/validate",
      { method: "POST", body: patch, signal },
    ),

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
        ...pageQuery(params),
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
   * GET /api/v1/admin/media/gc — the collector's boot facts (is the daily
   * automatic destructive sweep enabled, the orphan-ratio breaker limit) plus
   * its live bucket-ownership state (admin only; read-only — both knobs are
   * deliberately boot-baked). 503 when GC is not wired on this process; older
   * backends 404/405, so callers must degrade gracefully.
   */
  getMediaGCConfig: (signal?: AbortSignal) =>
    apiRequest<MediaGCConfig>("/api/v1/admin/media/gc", { signal }),

  /**
   * POST /api/v1/admin/media/gc/adopt-bucket — write this instance's identity
   * into the object store's `.vidra/owner` marker so destructive GC is
   * permitted again (admin only; audited). Idempotent, but it OVERWRITES a
   * marker naming a different install — on a genuinely shared bucket it takes
   * ownership away from the other one. 409 = local disk (nothing to adopt),
   * 502 = the marker could not be written, 503 = no instance identity yet
   * (migrations not run).
   */
  adoptMediaGCBucket: () =>
    apiRequest<MediaGCAdoptBucketResponse>("/api/v1/admin/media/gc/adopt-bucket", {
      method: "POST",
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
 * Resolve a manifest URL the backend advertised (on a playback session or a
 * detail response) against the API base: absolute URLs pass through, the
 * origin-relative paths the backend actually emits are prefixed. Falls back to a
 * deterministic path when nothing was advertised.
 */
function advertisedMediaUrl(advertisedUrl: string | null | undefined, fallbackPath: string): string {
  if (!advertisedUrl) return `${apiBaseUrl}${fallbackPath}`;
  if (/^https?:\/\//i.test(advertisedUrl)) return advertisedUrl;
  return `${apiBaseUrl}${advertisedUrl.startsWith("/") ? "" : "/"}${advertisedUrl}`;
}

/**
 * Direct URL to a video's HLS master playlist. Only meaningful once a playback
 * session (or, failing that, the detail) carries `hls_url` — the readiness
 * signal, since the playlist 404s before transcoding completes. When supplied,
 * the advertised URL is preferred so the generation-version cache key the
 * backend minted is preserved.
 */
export function videoHlsMasterUrl(
  id: string,
  pt?: string | null,
  advertisedUrl?: string | null,
): string {
  return withPlaybackToken(
    advertisedMediaUrl(
      advertisedUrl,
      `/api/v1/videos/${encodeURIComponent(id)}/hls/master.m3u8`,
    ),
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
 * stream is live and a media server is serving it (the session's / get
 * response's `hls_url` is the readiness signal — the playlist 404s otherwise).
 *
 * `pt` is the live playback token from POST /live/{id}/playback-session, present
 * only for a PRIVATE stream. Unlike VOD, the live playlist is written by the
 * media server and mutates every two seconds, so the API rewrites the segment
 * URIs to carry this same `?pt=` — relative resolution (RFC 3986 §5.2.2) would
 * otherwise discard the query and leave Safari's native HLS, which cannot set a
 * header, unable to fetch a single segment. Never pass a token that was not
 * issued: any credential marks the request credentialed.
 */
export function liveHlsMasterUrl(
  id: string,
  pt?: string | null,
  advertisedUrl?: string | null,
): string {
  return withPlaybackToken(
    advertisedMediaUrl(advertisedUrl, `/api/v1/live/${encodeURIComponent(id)}/hls/master.m3u8`),
    pt,
  );
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
