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
  terms_url: string;
  privacy_url: string;
  contact_email: string;
}

export type VideoPrivacy = "public" | "unlisted" | "private";
export type VideoState = "draft" | "processing" | "published" | "failed";

export interface Video {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  privacy: VideoPrivacy;
  state: VideoState;
  created_at: string;
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

export interface VideoFeedResponse {
  videos: Video[];
  sort: FeedSort;
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

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  email_verified: boolean;
  display_name: string;
  bio: string;
  created_at: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
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
}

/** Returned by register / login / refresh. */
export interface AuthResponse {
  token: string;
  refresh_token: string;
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
}

/** POST /api/v1/videos|comments/{id}/report and /api/v1/users/{id}/report body. */
export interface CreateReportRequest {
  reason: string;
}

export type ReportTargetType = "video" | "comment" | "account";
export type ReportStatus = "open" | "accepted" | "rejected";

/** Who filed a report (admin moderation queue view). */
export interface ReportReporter {
  username: string;
}

/**
 * An abuse report as seen by a moderator/admin in the queue. Target context is
 * type-dependent: a video report carries video_id/video_title, a comment report
 * carries comment_id/comment_body, an account report carries
 * reported_user_id/reported_username. Mirrors the backend Report schema.
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
 * A comment flagged by the watched-words list (matched a term when posted).
 * Mirrors the backend WatchedWordMatch schema.
 */
export interface WatchedWordMatch {
  id: string;
  word: string;
  comment_id: string;
  comment_body: string;
  video_id: string;
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
}

/** POST /api/v1/videos/{id}/file response (the published video + stored file). */
export interface UploadVideoResult {
  video: Video;
}

export interface Comment {
  id: string;
  video_id: string;
  body: string;
  /** The author's account id (so a signed-in viewer can mute them). */
  author_id: string;
  author_username: string;
  author_display_name: string;
  created_at: string;
  updated_at: string;
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

export type NotificationType = "follow" | "comment" | "message";

/** Who triggered a notification. */
export interface NotificationActor {
  username: string;
  display_name: string;
}

/**
 * A user notification. Context fields are type-dependent: follow carries the
 * channel, comment carries the video (+ comment id), message carries the
 * conversation. Mirrors the backend Notification schema.
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
  // Comment context.
  video_id?: string;
  video_title?: string;
  comment_id?: string;
  // Message context.
  conversation_id?: string;
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
