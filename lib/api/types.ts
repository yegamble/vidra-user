// Hand-maintained types mirroring the vidra-core HTTP contract
// (vidra-core/api/openapi.yaml). PROVISIONAL: keep in lock-step with the backend
// OpenAPI until generated types replace these. Never invent shapes here.

/** A field-level validation problem (present on 422 responses). */
export interface FieldError {
  field: string;
  message: string;
}

/** The single error envelope returned for every non-2xx response. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id?: string;
    fields?: FieldError[];
  };
}

export interface InstanceResponse {
  name: string;
  description: string;
  software: { name: string; version: string };
  registration_enabled: boolean;
  /** When true, signup files a pending request for admin approval (202) instead of creating an account. */
  registration_requires_approval: boolean;
  terms_url: string;
  privacy_url: string;
  contact_email: string;
}

export type VideoPrivacy = "public" | "unlisted" | "private";
// "scheduled": processed but publish_at lies in the future (public surfaces hide
// it). "quarantined": held for moderator review (QUARANTINE_NEW_UPLOADS) — only
// the owner and moderators see it until it is approved (published) or rejected
// (failed).
export type VideoState =
  | "draft"
  | "processing"
  | "scheduled"
  | "quarantined"
  | "published"
  | "failed";

export interface Video {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  privacy: VideoPrivacy;
  state: VideoState;
  created_at: string;
  /**
   * Whether this card is a federated REMOTE video (subscriptions feed, search,
   * public feed with scope=all). Remote cards omit the local-only fields
   * (channel_id, privacy, state — typed required here for the local shape the
   * app renders everywhere else; never read them on a remote card) and instead
   * carry domain/watch_url/stream_url. Local videos are always false/omitted.
   */
  remote?: boolean;
  /** REMOTE cards only: the origin instance's domain. */
  domain?: string;
  /** REMOTE cards only: the origin's human watch page (always present on remote cards). */
  watch_url?: string;
  /**
   * REMOTE cards only: best playable URL from the origin (HLS preferred, else a
   * direct video file). Omitted when the origin advertised none.
   */
  stream_url?: string;
  /**
   * The scheduled publish time (ISO date-time). Present on the detail,
   * create/update, and owner (studio) channel-list views once a schedule was
   * set; omitted otherwise. The server publishes automatically at this time.
   */
  publish_at?: string;
  // Discovery-card / detail extras — present on the endpoints that populate them,
  // omitted otherwise.
  duration_seconds?: number;
  width?: number;
  height?: number;
  has_thumbnail?: boolean;
  views?: number;
  // Owning channel, present on card/feed views (so a card can link to the
  // channel); omitted on the detail view.
  channel_handle?: string;
  channel_display_name?: string;
  // Optional taxonomy ids (see GET /videos/config); present on create/update/
  // detail when set, omitted otherwise.
  category?: string;
  language?: string;
  license?: string;
  // Free-form tags (lowercased, alphabetical; at most 5). Present on the
  // create/update/detail views; omitted when empty and on list/feed views.
  tags?: string[];
  // HLS streaming (transcoding pipeline). hls_url is the master-playlist path
  // (GET /videos/{id}/hls/master.m3u8), present on the DETAIL endpoint only once
  // the transcoded streaming playlist is ready — omitted while transcoding is
  // pending/failed or disabled (progressive /original playback always works).
  // renditions lists the available ladder rungs (tallest first) alongside it.
  hls_url?: string;
  renditions?: VideoRendition[];
}

/** One transcoded HLS rendition (ladder rung) of a video. */
export interface VideoRendition {
  height: number;
  width: number;
}

/** One selectable value in a video-metadata taxonomy (GET /videos/config). */
export interface VideoConfigOption {
  id: string;
  label: string;
}

/** GET /api/v1/videos/config — the taxonomy for the metadata dropdowns. */
export interface VideoConfigResponse {
  categories: VideoConfigOption[];
  licenses: VideoConfigOption[];
  languages: VideoConfigOption[];
  privacies: VideoConfigOption[];
}

export type FeedSort = "recent" | "popular" | "trending";

/**
 * Public-feed scope: "local" (this instance's videos only, the default) or
 * "all" (mixes in federated remote videos for discovery).
 */
export type FeedScope = "local" | "all";

export interface VideoFeedResponse {
  videos: Video[];
  sort: FeedSort;
  /** The scope actually applied (normalised); present on the public feed only. */
  scope?: FeedScope;
  limit: number;
  offset: number;
}

export interface VideoListResponse {
  videos: Video[];
}

export interface VideoSearchResponse {
  query: string;
  videos: Video[];
  limit: number;
  offset: number;
}

export type UserRole = "user" | "moderator" | "admin";

/**
 * Admin projection of an account (the password hash is never exposed). Mirrors
 * the backend AdminUser schema; returned by the admin users list + update.
 */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  display_name: string;
  created_at: string;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  limit: number;
  offset: number;
}

/**
 * A durable security-audit entry (auth/moderation/admin/registration action).
 * Mirrors the backend AuditLogEntry; never carries secrets/PII. actor_id /
 * actor_username are absent for unauthenticated events or deleted accounts.
 */
export interface AuditLogEntry {
  id: string;
  action: string;
  result: "success" | "failure";
  actor_id?: string;
  actor_username?: string;
  reason?: string;
  request_id?: string;
  occurred_at: string;
}

export interface AuditLogListResponse {
  entries: AuditLogEntry[];
  limit: number;
  offset: number;
}

/** Health of a single backend dependency in the system-status snapshot. */
export interface SystemStatusComponent {
  status: string; // ok | down | not_configured
  error?: string;
}

/**
 * Operational snapshot from GET /api/v1/admin/system. Mirrors the backend
 * SystemStatus schema; operational metadata only (no secrets/PII).
 */
export interface SystemStatus {
  status: "ok" | "degraded";
  software: {
    name: string;
    version: string;
    commit: string;
    build_date: string;
    go_version: string;
  };
  environment: string;
  uptime_seconds: number;
  components: Record<string, SystemStatusComponent>;
}

/** PATCH /api/v1/admin/users/{id} body — partial; provide at least one field. */
export interface UpdateUserRequest {
  role?: UserRole;
  is_active?: boolean;
}

export type RegistrationRequestStatus = "pending" | "approved" | "rejected";

/**
 * One entry in the admin registration approval queue. Mirrors the backend
 * RegistrationRequest schema; the stored password hash is never exposed.
 * reviewer_username / reviewed_at are omitted while pending; moderator_note is
 * the internal note recorded on reject; note is the applicant's message.
 */
export interface RegistrationRequest {
  id: string;
  username: string;
  email: string;
  note?: string;
  status: RegistrationRequestStatus;
  moderator_note?: string;
  reviewed_at?: string;
  created_at: string;
  reviewer_username?: string;
}

export interface RegistrationRequestListResponse {
  requests: RegistrationRequest[];
  limit: number;
  offset: number;
}

/** POST /api/v1/admin/registration-requests/{id}/reject body — note is optional. */
export interface RejectRegistrationRequest {
  note?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  email_verified: boolean;
  display_name: string;
  bio: string;
  /**
   * Account-level discovery opt-out. When true, the account's channels and
   * videos are excluded from public discovery surfaces (video feed, search)
   * while direct channel/video URLs keep serving. Default false.
   */
  unlisted?: boolean;
  created_at: string;
  /** Whether an avatar is set (served at GET /users/{id}/avatar). Present on GET/PATCH /auth/me. */
  has_avatar?: boolean;
  /** Whether a profile banner is set (served at GET /users/{id}/banner). Present on GET/PATCH /auth/me. */
  has_banner?: boolean;
}

/**
 * A stored avatar/banner's metadata, returned by the profile-image upload
 * endpoints. The image itself is served by the corresponding public GET route
 * with the Content-Type recorded here.
 */
export interface ProfileImage {
  kind: "avatar" | "banner";
  content_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  /** Optional message to the admins, used only when the instance requires registration approval. */
  note?: string;
  /** See LoginRequest.cookie_mode — the web client always sends true. */
  cookie_mode?: boolean;
}

/**
 * The 202 register outcome when the instance requires registration approval:
 * no account or token exists yet — a pending request was filed for admin review.
 */
export interface RegistrationPending {
  status: "pending";
}

export interface LoginRequest {
  email: string;
  password: string;
  /**
   * Opt the session into cookie mode (browser clients): the rotating refresh
   * token is delivered as an httpOnly `vidra_refresh` cookie and omitted from
   * the response body. The web client always sends true.
   */
  cookie_mode?: boolean;
}

/**
 * POST /api/v1/auth/refresh | /auth/logout body. `refresh_token` may be omitted
 * in cookie mode — the httpOnly `vidra_refresh` cookie carries it instead.
 */
export interface RefreshRequest {
  refresh_token?: string;
  cookie_mode?: boolean;
}

/** POST /api/v1/auth/password-reset — start the reset flow (always 202). */
export interface PasswordResetRequest {
  email: string;
}

/** POST /api/v1/auth/password-reset/confirm — set a new password with a token. */
export interface PasswordResetConfirmRequest {
  token: string;
  password: string;
}

/** POST /api/v1/auth/verify-email/confirm — mark the email verified with a token. */
export interface EmailVerificationConfirmRequest {
  token: string;
}

/** PATCH /api/v1/auth/me — partial profile update; omitted fields are unchanged. */
export interface UpdateProfileRequest {
  display_name?: string;
  bio?: string;
  /** Toggle the account-level discovery opt-out (see User.unlisted). */
  unlisted?: boolean;
}

/** Returned by register / login / refresh. */
export interface AuthResponse {
  token: string;
  /**
   * Opaque rotating refresh token. Omitted in cookie mode, where the httpOnly
   * `vidra_refresh` cookie is the sole carrier (what the web client uses).
   */
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Channel {
  id: string;
  owner_id: string;
  handle: string;
  display_name: string;
  description: string;
  follower_count: number;
  created_at: string;
  /** Whether an avatar is set (served at GET /channels/{handle}/avatar). */
  has_avatar?: boolean;
  /** Whether a banner is set (served at GET /channels/{handle}/banner). */
  has_banner?: boolean;
}

export interface ChannelListResponse {
  channels: Channel[];
}

/** POST /api/v1/channels body. */
export interface CreateChannelRequest {
  handle: string;
  display_name: string;
  description?: string;
}

/** PATCH /api/v1/channels/{handle} body — partial; the handle is immutable. */
export interface UpdateChannelRequest {
  display_name?: string;
  description?: string;
}

/** POST /api/v1/channels/{handle}/videos body (create a draft). */
export interface CreateVideoRequest {
  title: string;
  description?: string;
  privacy?: VideoPrivacy;
  category?: string;
  language?: string;
  license?: string;
  /**
   * Free-form tags; lowercased, trimmed, and deduped server-side. At most 5
   * distinct tags of at most 50 characters each (422 otherwise).
   */
  tags?: string[];
  /**
   * Schedule the publish (ISO date-time): after processing, the video parks in
   * the "scheduled" state until this time, then publishes automatically. Must
   * lie in the future (422 otherwise).
   */
  publish_at?: string;
}

/** POST /api/v1/videos|comments/{id}/report and /api/v1/users/{id}/report body. */
export interface CreateReportRequest {
  reason: string;
}

export type ReportTargetType = "video" | "comment" | "account" | "remote_video";
export type ReportStatus = "open" | "accepted" | "rejected";

/** Who filed a report (admin moderation queue view). */
export interface ReportReporter {
  username: string;
}

/**
 * An abuse report as seen by a moderator/admin in the queue. Target context is
 * type-dependent: a video report carries video_id/video_title, a comment report
 * carries comment_id/comment_body, an account report carries
 * reported_user_id/reported_username, a remote_video report carries
 * remote_video_id/remote_video_title/remote_video_domain. Mirrors the backend
 * Report schema.
 */
export interface Report {
  id: string;
  target_type: ReportTargetType;
  reason: string;
  status: ReportStatus;
  /** Internal moderator note (empty until resolved with one). */
  moderator_note: string;
  created_at: string;
  resolved_at?: string;
  reporter: ReportReporter;
  // Video-report context.
  video_id?: string;
  video_title?: string;
  // Comment-report context.
  comment_id?: string;
  comment_body?: string;
  // Account-report context.
  reported_user_id?: string;
  reported_username?: string;
  // Remote-video-report context (federated content).
  remote_video_id?: string;
  /** Title of the reported remote video; omitted if it was deleted. */
  remote_video_title?: string;
  /** Origin instance of the reported remote video. */
  remote_video_domain?: string;
}

export interface ReportListResponse {
  reports: Report[];
  limit: number;
  offset: number;
}

/** POST /api/v1/admin/reports/{id}/resolve body. */
export interface ResolveReportRequest {
  status: "accepted" | "rejected";
  note?: string;
}

/** POST /api/v1/admin/videos/{id}/block body; the reason is recorded for audit. */
export interface BlockVideoRequest {
  reason?: string;
}

/**
 * A currently-blocked video as seen by a moderator/admin in the block-list.
 * Mirrors the backend BlockedVideo schema. `blocked_by` is omitted when the
 * moderator who blocked it has since been deleted.
 */
export interface BlockedVideo {
  video_id: string;
  title: string;
  privacy: string;
  state: string;
  channel_handle: string;
  channel_display_name: string;
  reason: string;
  blocked_by?: string;
  blocked_at: string;
}

export interface BlockedVideoListResponse {
  videos: BlockedVideo[];
  limit: number;
  offset: number;
}

/**
 * A currently-blocked federated remote video in the moderation block-list.
 * Blocking hides it from every local surface (feeds, search, /remote/{id}),
 * so review links go to the origin's watch_url. Mirrors the backend
 * BlockedRemoteVideo schema; `blocked_by` is omitted when that moderator
 * account was deleted.
 */
export interface BlockedRemoteVideo {
  remote_video_id: string;
  title: string;
  /** The remote video's ActivityPub object id. */
  object_url: string;
  /** The origin's human watch page. */
  watch_url: string;
  /** The origin channel identity ("name@domain"). */
  channel_handle: string;
  /** The origin instance. */
  domain: string;
  reason: string;
  blocked_by?: string;
  blocked_at: string;
}

export interface BlockedRemoteVideoListResponse {
  videos: BlockedRemoteVideo[];
  limit: number;
  offset: number;
}

/**
 * A video in the admin/moderator videos overview (any privacy/state), with its
 * current block status. Mirrors the backend AdminVideo schema.
 */
export interface AdminVideo {
  id: string;
  title: string;
  privacy: string;
  state: string;
  channel_handle: string;
  channel_display_name: string;
  views: number;
  created_at: string;
  blocked: boolean;
}

export interface AdminVideoListResponse {
  videos: AdminVideo[];
  limit: number;
  offset: number;
}

/**
 * A comment in the admin/moderator comments overview, with author + video
 * context. Mirrors the backend AdminComment schema.
 */
export interface AdminComment {
  id: string;
  video_id: string;
  video_title: string;
  body: string;
  author_username: string;
  author_display_name: string;
  created_at: string;
}

export interface AdminCommentListResponse {
  comments: AdminComment[];
  limit: number;
  offset: number;
}

/** A term on the instance-wide watched-words list. Mirrors the backend WatchedWord schema. */
export interface WatchedWord {
  id: string;
  word: string;
  /** Username of the moderator who added it; omitted on the create response or if deleted. */
  created_by_username?: string;
  created_at: string;
}

export interface WatchedWordListResponse {
  words: WatchedWord[];
  limit: number;
  offset: number;
}

/** POST /api/v1/admin/watched-words body. */
export interface CreateWatchedWordRequest {
  word: string;
}

/**
 * Content flagged by the watched-words list, for moderator review: a comment
 * (type "comment"; comment_id/comment_body present, video_id is the video it is
 * on) or a video (type "video"; comment fields absent, video_id/video_title are
 * the flagged video). Mirrors the backend WatchedWordMatch schema.
 */
export interface WatchedWordMatch {
  id: string;
  word: string;
  /** What was flagged. */
  type: "comment" | "video";
  /** The flagged comment (comment matches only). */
  comment_id?: string;
  /** The flagged comment's body (comment matches only). */
  comment_body?: string;
  /** The flagged video, or the video the flagged comment is on. */
  video_id: string;
  /** The video's title (a link target for the review queue). */
  video_title: string;
  /** The comment's author or the video's owner respectively. */
  author_username: string;
  created_at: string;
}

export interface WatchedWordMatchListResponse {
  matches: WatchedWordMatch[];
  limit: number;
  offset: number;
}

/** PATCH /api/v1/videos/{id} body; provide at least one field, omitted ones unchanged. */
export interface UpdateVideoRequest {
  title?: string;
  description?: string;
  privacy?: VideoPrivacy;
  category?: string;
  language?: string;
  license?: string;
  /**
   * Replaces the video's whole tag set (an empty array clears it; omit the
   * field to leave tags unchanged). Same limits as create.
   */
  tags?: string[];
  /**
   * Set (or move) the scheduled publish time (ISO date-time). Only accepted
   * while the video is not yet published, and must lie in the future (422
   * otherwise).
   */
  publish_at?: string;
}

/** POST /api/v1/videos/{id}/file response (the published video + stored file). */
export interface UploadVideoResult {
  video: Video;
}

/** A stored video file (original or thumbnail). Mirrors the backend VideoFile. */
export interface VideoFile {
  id: string;
  kind: string;
  content_type: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
}

export type LiveStreamState = "offline" | "live" | "ended";

/**
 * A live stream's metadata. The stream key is never part of this — it is returned
 * only by create/regenerate (see CreateLiveStreamResponse / LiveStreamKey).
 * channel_handle/display_name are present on the single-stream get.
 */
export interface LiveStream {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  privacy: VideoPrivacy;
  state: LiveStreamState;
  permanent: boolean;
  created_at: string;
  updated_at: string;
  channel_handle?: string;
  channel_display_name?: string;
}

export interface CreateLiveStreamRequest {
  title: string;
  description?: string;
  privacy?: VideoPrivacy;
  permanent?: boolean;
}

/** The create response: the stream plus its key (shown once) and RTMP ingest URL. */
export interface CreateLiveStreamResponse {
  live_stream: LiveStream;
  stream_key: string;
  rtmp_url?: string;
}

export interface LiveStreamListResponse {
  live_streams: LiveStream[];
}

/** A regenerated stream key (shown once) plus the RTMP ingest URL. */
export interface LiveStreamKey {
  stream_key: string;
  rtmp_url?: string;
}

export interface Comment {
  id: string;
  video_id: string;
  body: string;
  /**
   * The author's account id (so a signed-in viewer can mute them) — null for
   * a federated (remote-authored) comment, which has no local account.
   */
  author_id: string | null;
  /**
   * The local author's username, or — for a remote comment — the remote
   * author-name snapshot captured at ingestion.
   */
  author_username: string;
  author_display_name: string;
  /** True for a federated comment authored on another instance. */
  remote: boolean;
  /** The remote author's origin instance; omitted for local comments. */
  author_domain?: string;
  created_at: string;
  updated_at: string;
  /** True once the body has been edited (updated_at moved past created_at). */
  edited: boolean;
}

export interface CommentListResponse {
  comments: Comment[];
  limit: number;
  offset: number;
}

/** A WebVTT caption track's metadata. Mirrors the backend Caption schema. */
export interface Caption {
  language: string;
  label: string;
  created_at: string;
}

export interface CaptionListResponse {
  captions: Caption[];
}

/** An account the caller has muted. Mirrors the backend MutedAccount schema. */
export interface MutedAccount {
  user_id: string;
  username: string;
  display_name: string;
  muted_at: string;
}

export interface MutedAccountListResponse {
  accounts: MutedAccount[];
  limit: number;
  offset: number;
}

/**
 * A remote instance the caller has muted (its videos/comments are hidden from
 * the caller's surfaces). Mirrors the backend MutedInstance schema.
 */
export interface MutedInstance {
  domain: string;
  muted_at: string;
}

export interface MutedInstanceListResponse {
  instances: MutedInstance[];
  limit: number;
  offset: number;
}

/** POST /api/v1/admin/instances/blocked body. */
export interface BlockInstanceRequest {
  /** Bare hostname (optionally host:port) of the instance to block. */
  domain: string;
  /** Recorded on the blocklist and in the audit trail. May be empty. */
  reason?: string;
}

/**
 * A remote instance on the admin blocklist: inbound activity from it is
 * dropped, its content hidden, outbound deliveries cancelled. Mirrors the
 * backend BlockedInstance schema. blocked_by is omitted when that admin
 * account was deleted.
 */
export interface BlockedInstance {
  domain: string;
  reason: string;
  blocked_by?: string;
  blocked_at: string;
}

export interface BlockedInstanceListResponse {
  instances: BlockedInstance[];
  limit: number;
  offset: number;
}

/**
 * The full stored metadata of a federated remote video (GET /remote-videos/{id}).
 * Remote videos are metadata only — playback uses stream_url from the origin
 * when present, and watch_url always links the origin's watch page.
 */
export interface RemoteVideo {
  id: string;
  /** Always true. Distinguishes remote metadata from local videos. */
  remote: boolean;
  /** The origin instance's domain. */
  domain: string;
  title: string;
  description: string;
  /** The ActivityPub object id on the origin. */
  object_url: string;
  /** The origin's human watch page. */
  watch_url: string;
  /**
   * Best playable URL from the origin (HLS preferred, else a direct video
   * file). Omitted when the origin advertised none.
   */
  stream_url?: string;
  duration_seconds?: number;
  published_at?: string;
  /** Whether a locally cached thumbnail is available (see remoteVideoThumbnailUrl). */
  has_thumbnail: boolean;
}

/**
 * POST /api/v1/me/remote-follows body — names the remote channel to follow.
 * Exactly one of handle ("name@domain", leading @ tolerated) or actor_url.
 */
export interface CreateRemoteFollowRequest {
  handle?: string;
  actor_url?: string;
}

/**
 * pending until the remote instance Accepts the follow, then accepted (only
 * accepted follows feed the subscriptions feed). A remote Reject removes it.
 */
export type RemoteFollowState = "pending" | "accepted";

/** The caller's outbound follow of a remote channel. Mirrors the backend RemoteFollow schema. */
export interface RemoteFollow {
  /** The follow row id (the DELETE /me/remote-follows/{id} key). */
  id: string;
  /** The followed remote channel's ActivityPub actor URL. */
  actor_url: string;
  /** The followed channel's "name@domain" identity. */
  handle: string;
  /** The origin instance's domain. */
  domain: string;
  state: RemoteFollowState;
  created_at: string;
}

export interface RemoteFollowListResponse {
  follows: RemoteFollow[];
  limit: number;
  offset: number;
}

/**
 * An account the caller has blocked. A block symmetrically cuts off direct
 * messaging between the two. Mirrors the backend BlockedUser schema.
 */
export interface BlockedUser {
  user_id: string;
  username: string;
  display_name: string;
  blocked_at: string;
}

export interface BlockedUserListResponse {
  users: BlockedUser[];
  limit: number;
  offset: number;
}

/** A 1:1 conversation (normal, non-E2EE direct messaging). */
export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
}

/**
 * A conversation as shown in the inbox: the other participant plus a preview of
 * the last message. Mirrors the backend ConversationSummary schema.
 * `last_message_body` is "" when the conversation has no messages yet.
 */
export interface ConversationSummary {
  id: string;
  updated_at: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  last_message_body: string;
  last_message_at: string;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  limit: number;
  offset: number;
}

/**
 * A single direct message. sender_username/sender_display_name are populated on
 * list and on the send response (the authenticated sender).
 */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username?: string;
  sender_display_name?: string;
  body: string;
  created_at: string;
}

export interface MessageListResponse {
  messages: Message[];
  limit: number;
  offset: number;
}

export type RatingValue = "like" | "dislike";

export interface VideoRating {
  like_count: number;
  dislike_count: number;
  my_rating: RatingValue | null;
}

/** GET /api/v1/videos/{id}/watch-progress — the caller's saved resume position. */
export interface WatchProgress {
  video_id: string;
  /** Saved resume position in whole seconds (0 when none recorded). */
  position_seconds: number;
}

/**
 * A watch-history card: a video card plus the caller's saved resume position and
 * when they last watched it. Mirrors the backend HistoryItem (allOf Video + …).
 */
export interface HistoryItem extends Video {
  position_seconds: number;
  watched_at: string;
}

export interface WatchHistoryResponse {
  videos: HistoryItem[];
  limit: number;
  offset: number;
}

export type NotificationType =
  | "follow"
  | "comment"
  | "message"
  | "report_resolved"
  | "video_rejected";

/** Who triggered a notification. */
export interface NotificationActor {
  username: string;
  display_name: string;
}

/**
 * A user notification. Context fields are type-dependent: follow carries the
 * channel, comment carries the video (+ comment id), message carries the
 * conversation, report_resolved carries the report outcome, video_rejected
 * carries the rejected upload (the moderator's identity is never included).
 * Mirrors the backend Notification schema.
 */
export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  actor?: NotificationActor;
  // Follow context.
  channel_handle?: string;
  channel_display_name?: string;
  // Comment context (video_id/video_title also carry the rejected upload for
  // video_rejected notifications).
  video_id?: string;
  video_title?: string;
  comment_id?: string;
  // Message context.
  conversation_id?: string;
  // Report-resolved context (actor is absent for this type).
  report_id?: string;
  report_status?: ReportStatus;
  report_target_type?: ReportTargetType;
}

export interface NotificationListResponse {
  notifications: Notification[];
  unread_count: number;
  limit: number;
  offset: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export type PlaylistVisibility = "public" | "unlisted" | "private";

/** A named, ordered collection of videos. Mirrors the backend Playlist schema. */
export interface Playlist {
  id: string;
  title: string;
  description: string;
  visibility: PlaylistVisibility;
  /** Number of public, published videos in the playlist. */
  video_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistListResponse {
  playlists: Playlist[];
}

/** A playlist plus its ordered public video cards (the detail endpoint). */
export interface PlaylistDetail extends Playlist {
  videos: Video[];
}

/** POST /api/v1/playlists body. */
export interface CreatePlaylistRequest {
  title: string;
  description?: string;
  visibility?: PlaylistVisibility;
}

/** PATCH /api/v1/playlists/{id} body; omitted fields are unchanged. */
export interface UpdatePlaylistRequest {
  title?: string;
  description?: string;
  visibility?: PlaylistVisibility;
}

/** One day of a stats series (UTC calendar day). */
export interface DailyViews {
  /** ISO date, e.g. "2026-07-03". */
  day: string;
  views: number;
}

/**
 * GET /api/v1/videos/{id}/stats — creator statistics for one video (owner
 * only). daily_views is a dense 30-day series, oldest first, zero-filled.
 */
export interface VideoStatsResponse {
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  daily_views: DailyViews[];
}

/**
 * GET /api/v1/channels/{handle}/stats — aggregated creator statistics across a
 * channel's videos (owner only), plus follower/video counts and the dense
 * 30-day daily-views series (oldest first, zero-filled).
 */
export interface ChannelStatsResponse {
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  followers: number;
  /** Total videos on the channel (any privacy/state). */
  videos: number;
  daily_views: DailyViews[];
}

/**
 * GET/PATCH /api/v1/me/notification-prefs response: every known notification
 * type mapped to whether it is delivered to this user. Types with no stored
 * preference default to true.
 */
export interface NotificationPrefsResponse {
  prefs: Record<string, boolean>;
}

/**
 * PATCH /api/v1/me/notification-prefs body: a partial map of notification
 * type -> enabled. Only the types present are changed; an unknown type rejects
 * the whole update (422). Known types: comment, follow, message,
 * report_resolved, video_rejected.
 */
export interface UpdateNotificationPrefsRequest {
  prefs: Record<string, boolean>;
}

/**
 * An upload held for moderator review (QUARANTINE_NEW_UPLOADS), as seen in the
 * moderation quarantine queue. Mirrors the backend QuarantinedVideo schema.
 */
export interface QuarantinedVideo {
  id: string;
  title: string;
  privacy: VideoPrivacy;
  state: "quarantined";
  channel_handle: string;
  channel_display_name: string;
  /** The owning account's username. */
  owner_username: string;
  created_at: string;
}

export interface QuarantinedVideoListResponse {
  videos: QuarantinedVideo[];
  limit: number;
  offset: number;
}

/**
 * POST /api/v1/admin/videos/{id}/reject body (optional). The reason is
 * recorded in the audit trail — it is not shown to the owner.
 */
export interface RejectQuarantinedVideoRequest {
  reason?: string;
}
