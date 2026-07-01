// API types for the vidra-core HTTP contract.
//
// These are NOT hand-maintained: every type below is DERIVED from the generated
// `generated.ts`, which `npm run codegen` produces from vidra-core's
// api/openapi.yaml (the source of truth). This makes drift structurally
// impossible — if the backend changes a schema, the regenerated types change and
// TypeScript fails at the call sites that no longer match. Do not hand-edit shapes
// here; change the OpenAPI spec in vidra-core and re-run `npm run codegen`.
//
// The named aliases below preserve the public type names the app imports from
// `@/lib/api`, mapping each onto its OpenAPI component schema (or, for the few
// request bodies that are inline rather than named components, onto the generated
// `operations`).

import type { components, operations } from "./generated";

type Schemas = components["schemas"];

// Re-export the raw generated maps for anything not aliased below.
export type { components, operations, paths } from "./generated";

// --- Errors -----------------------------------------------------------------
export type ApiErrorEnvelope = Schemas["ErrorResponse"];
/** A field-level validation problem (present on 422 responses). */
export type FieldError = NonNullable<Schemas["ErrorResponse"]["error"]["fields"]>[number];

// --- Instance ---------------------------------------------------------------
export type InstanceResponse = Schemas["InstanceResponse"];

// --- Video ------------------------------------------------------------------
export type Video = Schemas["Video"];
export type VideoPrivacy = Schemas["Video"]["privacy"];
export type VideoState = Schemas["Video"]["state"];
export type VideoConfigOption = Schemas["VideoConfigOption"];
export type VideoConfigResponse = Schemas["VideoConfigResponse"];
export type FeedSort = Schemas["VideoFeedResponse"]["sort"];
export type VideoFeedResponse = Schemas["VideoFeedResponse"];
export type VideoListResponse = Schemas["VideoListResponse"];
export type VideoSearchResponse = Schemas["VideoSearchResponse"];
export type CreateVideoRequest = Schemas["CreateVideoRequest"];
export type UpdateVideoRequest = Schemas["UpdateVideoRequest"];
/** POST /api/v1/videos/{id}/file response (the published video + stored file). */
export type UploadVideoResult = Schemas["UploadVideoFileResponse"];

// --- Users / auth -----------------------------------------------------------
export type UserRole = Schemas["User"]["role"];
export type User = Schemas["User"];
export type AdminUser = Schemas["AdminUser"];
export type AdminUserListResponse = Schemas["AdminUserListResponse"];
export type UpdateUserRequest = Schemas["UpdateUserRequest"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type LoginRequest = Schemas["LoginRequest"];
export type UpdateProfileRequest = Schemas["UpdateProfileRequest"];
export type AuthResponse = Schemas["AuthResponse"];
// These request bodies are inline in the spec (not named components), so derive
// them from the generated operations.
export type PasswordResetRequest =
  NonNullable<operations["requestPasswordReset"]["requestBody"]>["content"]["application/json"];
export type PasswordResetConfirmRequest =
  NonNullable<operations["confirmPasswordReset"]["requestBody"]>["content"]["application/json"];
export type EmailVerificationConfirmRequest =
  NonNullable<operations["confirmEmailVerification"]["requestBody"]>["content"]["application/json"];

// --- Channels ---------------------------------------------------------------
export type Channel = Schemas["Channel"];
export type ChannelListResponse = Schemas["ChannelListResponse"];
export type CreateChannelRequest = Schemas["CreateChannelRequest"];
export type UpdateChannelRequest = Schemas["UpdateChannelRequest"];

// --- Reports / moderation ---------------------------------------------------
export type CreateReportRequest = Schemas["CreateReportRequest"];
export type ReportTargetType = Schemas["Report"]["target_type"];
export type ReportStatus = Schemas["Report"]["status"];
export type ReportReporter = Schemas["ReportReporter"];
export type Report = Schemas["Report"];
export type ReportListResponse = Schemas["ReportListResponse"];
export type ResolveReportRequest = Schemas["ResolveReportRequest"];
export type BlockVideoRequest = Schemas["BlockVideoRequest"];
export type BlockedVideo = Schemas["BlockedVideo"];
export type BlockedVideoListResponse = Schemas["BlockedVideoListResponse"];
export type AdminVideo = Schemas["AdminVideo"];
export type AdminVideoListResponse = Schemas["AdminVideoListResponse"];
export type AdminComment = Schemas["AdminComment"];
export type AdminCommentListResponse = Schemas["AdminCommentListResponse"];
export type WatchedWord = Schemas["WatchedWord"];
export type WatchedWordListResponse = Schemas["WatchedWordListResponse"];
export type CreateWatchedWordRequest = Schemas["CreateWatchedWordRequest"];

// --- Comments ---------------------------------------------------------------
export type Comment = Schemas["Comment"];
export type CommentListResponse = Schemas["CommentListResponse"];

// --- Captions ---------------------------------------------------------------
export type Caption = Schemas["Caption"];
export type CaptionListResponse = Schemas["CaptionListResponse"];

// --- Mutes ------------------------------------------------------------------
export type MutedAccount = Schemas["MutedAccount"];
export type MutedAccountListResponse = Schemas["MutedAccountListResponse"];

// --- Ratings ----------------------------------------------------------------
export type RatingValue = NonNullable<Schemas["VideoRating"]["my_rating"]>;
export type VideoRating = Schemas["VideoRating"];

// --- Watch progress / history ----------------------------------------------
export type WatchProgress = Schemas["WatchProgress"];
export type HistoryItem = Schemas["HistoryItem"];
export type WatchHistoryResponse = Schemas["WatchHistoryResponse"];

// --- Notifications ----------------------------------------------------------
export type NotificationType = Schemas["Notification"]["type"];
export type NotificationActor = Schemas["NotificationActor"];
export type Notification = Schemas["Notification"];
export type NotificationListResponse = Schemas["NotificationListResponse"];
export type UnreadCountResponse = Schemas["UnreadCountResponse"];

// --- Playlists --------------------------------------------------------------
export type PlaylistVisibility = Schemas["Playlist"]["visibility"];
export type Playlist = Schemas["Playlist"];
export type PlaylistListResponse = Schemas["PlaylistListResponse"];
export type PlaylistDetail = Schemas["PlaylistDetailResponse"];
export type CreatePlaylistRequest = Schemas["CreatePlaylistRequest"];
export type UpdatePlaylistRequest = Schemas["UpdatePlaylistRequest"];
