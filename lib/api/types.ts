// API types for the vidra-core HTTP contract.
//
// These are NOT hand-maintained: every type below is DERIVED from the generated
// `generated.ts`, which `npm run codegen` (scripts/codegen.mjs) produces from
// vidra-core's api/openapi.yaml — the single source of truth. This makes drift
// structurally impossible: if the backend changes a schema, the regenerated types
// change and TypeScript fails at the call sites that no longer match. Do NOT
// hand-edit shapes here — change the OpenAPI spec in vidra-core and re-run
// `npm run codegen`, then commit the refreshed generated.ts.
//
// The named aliases below preserve the public type names the app imports from
// `@/lib/api`, mapping each onto its OpenAPI component schema. The few union/enum
// types are derived from the owning schema's field (wrapped in NonNullable so an
// optional/nullable field still yields the narrow union), and the handful of
// request bodies that are inline (not named components) are derived from the
// generated `operations`.

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
export type InstanceAboutResponse = Schemas["InstanceAboutResponse"];
export type InstanceContactRequest = Schemas["InstanceContactRequest"];
export type SensitiveContentPolicy = NonNullable<InstanceResponse["sensitive_content_policy"]>;

// --- Video ------------------------------------------------------------------
export type VideoPrivacy = NonNullable<Schemas["Video"]["privacy"]>;
export type VideoState = NonNullable<Schemas["Video"]["state"]>;
export type Video = Schemas["Video"];
export type SensitiveVideoFields = Pick<Video, "is_sensitive">;
export type VideoRendition = Schemas["VideoRendition"];
// Seek-bar chapters (CORE-15): a video's chapter list (GET, ascending) and the
// whole-set replace request (PUT). One chapter = { start_seconds, title }.
export type VideoChapter = Schemas["VideoChapter"];
export type VideoChapters = Schemas["VideoChapters"];
export type SetVideoChaptersRequest = Schemas["SetVideoChaptersRequest"];
// IPFS mirror CIDs on the public video detail (present only when public+published
// and at least one object is pinned). The card/feed IPFS badge reads the boolean
// Video["ipfs_pinned"]; this object carries the gateway CIDs for detail consumers.
export type VideoIPFS = Schemas["VideoIPFS"];
// Password-protected videos + embed privacy (CORE-17). The unlock request/response
// mint a short-lived, video-scoped playback token; the password projections expose
// id + created_at only (the plaintext/hash are write-only). EmbedPrivacy is the
// tier + (whitelist only) allow-listed hostnames.
export type UnlockVideoRequest = Schemas["UnlockVideoRequest"];
export type UnlockVideoResponse = Schemas["UnlockVideoResponse"];
export type VideoPassword = Schemas["VideoPassword"];
export type VideoPasswords = Schemas["VideoPasswords"];
export type SetVideoPasswordRequest = Schemas["SetVideoPasswordRequest"];
export type ReplaceVideoPasswordsRequest = Schemas["ReplaceVideoPasswordsRequest"];
export type EmbedPrivacy = Schemas["EmbedPrivacy"];
export type EmbedPrivacyStatus = EmbedPrivacy["status"];
export type VideoConfigOption = Schemas["VideoConfigOption"];
export type VideoConfigResponse = Schemas["VideoConfigResponse"];
export type FeedSort = NonNullable<Schemas["VideoFeedResponse"]["sort"]>;
export type FeedScope = NonNullable<Schemas["VideoFeedResponse"]["scope"]>;
export type VideoFeedResponse = Schemas["VideoFeedResponse"];
export type VideoListResponse = Schemas["VideoListResponse"];
export type VideoSearchResponse = Schemas["VideoSearchResponse"];

// --- Users / auth -----------------------------------------------------------
export type UserRole = NonNullable<Schemas["User"]["role"]>;
export type AdminUser = Schemas["AdminUser"];
export type AdminUserListResponse = Schemas["AdminUserListResponse"];
export type AuditLogEntry = Schemas["AuditLogEntry"];
export type AuditLogListResponse = Schemas["AuditLogListResponse"];
export type SystemStatusComponent = Schemas["ComponentStatus"];
export type SystemStatus = Schemas["SystemStatus"];
export type AdminStats = Schemas["AdminStats"];
export type UpdateUserRequest = Schemas["UpdateUserRequest"];

// --- Admin: instance settings / jobs / media GB (slice user-admin-config) ----
export type InstanceSetting = Schemas["InstanceSetting"];
export type InstanceSettingType = NonNullable<Schemas["InstanceSetting"]["type"]>;
export type InstanceSettingsResponse = Schemas["InstanceSettingsResponse"];
export type UpdateInstanceSettingsRequest = Schemas["UpdateInstanceSettingsRequest"];
export type JobsOverview = Schemas["JobsOverview"];
export type QueueStatus = Schemas["QueueStatus"];
export type JobFailure = Schemas["JobFailure"];
export type MediaGCResponse = Schemas["MediaGCResponse"];

// --- Admin: PeerTube import / migration (P10 UI over P18 backend) ------------
export type PeerTubeImportLaunchRequest = Schemas["PeerTubeImportLaunchRequest"];
export type PeerTubeImportMode = NonNullable<Schemas["PeerTubeImportLaunchRequest"]["mode"]>;
export type PeerTubeImportConflictPolicy = NonNullable<
  Schemas["PeerTubeImportLaunchRequest"]["conflict_policy"]
>;
export type PeerTubeImportCounts = Schemas["PeerTubeImportCounts"];
export type PeerTubeImportReport = Schemas["PeerTubeImportReport"];
export type PeerTubeImportRun = Schemas["PeerTubeImportRun"];
export type PeerTubeImportRunState = NonNullable<Schemas["PeerTubeImportRun"]["state"]>;
export type PeerTubeImportRunList = Schemas["PeerTubeImportRunList"];

export type RegistrationRequestStatus = NonNullable<Schemas["RegistrationRequest"]["status"]>;
export type RegistrationRequest = Schemas["RegistrationRequest"];
export type RegistrationRequestListResponse = Schemas["RegistrationRequestListResponse"];
export type RejectRegistrationRequest = Schemas["RejectRegistrationRequest"];
export type User = Schemas["User"];
export type ProfileImage = Schemas["ProfileImage"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type RegistrationPending = Schemas["RegistrationPending"];
export type LoginRequest = Schemas["LoginRequest"];
export type RefreshRequest = Schemas["RefreshRequest"];
// These request bodies are inline in the spec (not named components), so derive
// them from the generated operations.
export type PasswordResetRequest =
  NonNullable<operations["requestPasswordReset"]["requestBody"]>["content"]["application/json"];
export type PasswordResetConfirmRequest =
  NonNullable<operations["confirmPasswordReset"]["requestBody"]>["content"]["application/json"];
export type EmailVerificationConfirmRequest =
  NonNullable<operations["confirmEmailVerification"]["requestBody"]>["content"]["application/json"];
export type UpdateProfileRequest = Schemas["UpdateProfileRequest"];
export type AccountExportStatus = Schemas["AccountExportStatus"];
export type AccountArchive = Schemas["AccountArchive"];
export type AccountImportSummary = Schemas["AccountImportSummary"];
export type DeleteAccountRequest = Schemas["DeleteAccountRequest"];
export type MFARequiredResponse = Schemas["MFARequiredResponse"];
export type MFAStatusResponse = Schemas["MFAStatusResponse"];
export type TOTPEnrollmentResponse = Schemas["TOTPEnrollmentResponse"];
export type RecoveryCodesResponse = Schemas["RecoveryCodesResponse"];
export type MFAChallengeRequest = Schemas["MFAChallengeRequest"];
export type OAuthIdentity = Schemas["OAuthIdentity"];
export type OAuthIdentitiesResponse = Schemas["OAuthIdentitiesResponse"];
export type AuthResponse = Schemas["AuthResponse"];

// --- Channels ---------------------------------------------------------------
export type Channel = Schemas["Channel"];
export type ChannelListResponse = Schemas["ChannelListResponse"];
export type FollowedChannel = Schemas["FollowedChannel"];
export type FollowedChannelsResponse = Schemas["FollowedChannelsResponse"];

// --- Channel auto-sync (UPLOAD-13, backport W2.U5) --------------------------
export type ChannelSync = Schemas["ChannelSync"];
export type ChannelSyncState = NonNullable<Schemas["ChannelSync"]["state"]>;
export type ChannelSyncResponse = Schemas["ChannelSyncResponse"];
export type ChannelSyncListResponse = Schemas["ChannelSyncListResponse"];
export type CreateChannelSyncRequest = Schemas["CreateChannelSyncRequest"];

// --- Donation addresses (simple NON-CUSTODIAL crypto donation display) ------
export type DonationNetwork = NonNullable<Schemas["DonationAddress"]["network"]>;
export type DonationAddress = Schemas["DonationAddress"];
export type DonationAddressListResponse = Schemas["DonationAddressListResponse"];
export type AddDonationAddressRequest = Schemas["AddDonationAddressRequest"];
export type DonationChallengeResponse = Schemas["DonationChallengeResponse"];
export type VerifyDonationAddressRequest = Schemas["VerifyDonationAddressRequest"];

// --- Channel / video mutations ----------------------------------------------
export type CreateChannelRequest = Schemas["CreateChannelRequest"];
export type UpdateChannelRequest = Schemas["UpdateChannelRequest"];
export type CreateVideoRequest = Schemas["CreateVideoRequest"];

// --- Reports / moderation ---------------------------------------------------
export type CreateReportRequest = Schemas["CreateReportRequest"];
export type ReportTargetType = NonNullable<Schemas["Report"]["target_type"]>;
export type ReportStatus = NonNullable<Schemas["Report"]["status"]>;
export type ReportReporter = Schemas["ReportReporter"];
export type Report = Schemas["Report"];
export type ReportListResponse = Schemas["ReportListResponse"];
export type ResolveReportRequest = Schemas["ResolveReportRequest"];
export type BlockVideoRequest = Schemas["BlockVideoRequest"];
export type BlockedVideo = Schemas["BlockedVideo"];
export type BlockedVideoListResponse = Schemas["BlockedVideoListResponse"];
export type BlockedRemoteVideo = Schemas["BlockedRemoteVideo"];
export type BlockedRemoteVideoListResponse = Schemas["BlockedRemoteVideoListResponse"];
export type AdminVideo = Schemas["AdminVideo"];
export type AdminVideoListResponse = Schemas["AdminVideoListResponse"];
export type AdminComment = Schemas["AdminComment"];
export type AdminCommentListResponse = Schemas["AdminCommentListResponse"];
export type WatchedWord = Schemas["WatchedWord"];
export type WatchedWordListResponse = Schemas["WatchedWordListResponse"];
export type CreateWatchedWordRequest = Schemas["CreateWatchedWordRequest"];
export type WatchedWordMatch = Schemas["WatchedWordMatch"];
export type WatchedWordMatchListResponse = Schemas["WatchedWordMatchListResponse"];

// --- Video update / upload --------------------------------------------------
export type UpdateVideoRequest = Schemas["UpdateVideoRequest"];
/** POST /api/v1/videos/{id}/file response (the published video + stored file). */
export type UploadVideoResult = Schemas["UploadVideoFileResponse"];
export type CreateUploadSessionRequest = Schemas["CreateUploadSessionRequest"];
export type UploadSessionResponse = Schemas["UploadSessionResponse"];
export type UploadSessionState = NonNullable<Schemas["UploadStatusResponse"]["state"]>;
export type UploadStatusResponse = Schemas["UploadStatusResponse"];
/** GET /api/v1/me/uploads — one of the caller's active resumable sessions. */
export type ActiveUpload = Schemas["ActiveUpload"];
export type ActiveUploadsResponse = Schemas["ActiveUploadsResponse"];
export type ImportJobState = NonNullable<Schemas["ImportJob"]["state"]>;
export type ImportJob = Schemas["ImportJob"];
export type ImportJobResponse = Schemas["ImportJobResponse"];
export type ImportResolver = NonNullable<Schemas["ImportVideoRequest"]["resolver"]>;
export type VideoFile = Schemas["VideoFile"];

// --- Live streaming ---------------------------------------------------------
export type LiveStreamState = NonNullable<Schemas["LiveStream"]["state"]>;
export type LiveStream = Schemas["LiveStream"];
export type CreateLiveStreamRequest = Schemas["CreateLiveStreamRequest"];
export type UpdateLiveStreamRequest = Schemas["UpdateLiveStreamRequest"];
export type CreateLiveStreamResponse = Schemas["CreateLiveStreamResponse"];
export type LiveStreamListResponse = Schemas["LiveStreamListResponse"];
export type LiveStreamKey = Schemas["LiveStreamKey"];
// The public "Live now" listing card — a minimal, truthful projection of a
// currently-live PUBLIC stream (no viewer count, no thumbnail: neither exists
// server-side yet). Distinct from LiveStream (the owner/watch metadata).
export type LiveStreamCard = Schemas["LiveStreamCard"];
export type LivePublicListResponse = Schemas["LivePublicListResponse"];

// --- Comments ---------------------------------------------------------------
export type Comment = Schemas["Comment"];
export type CommentListResponse = Schemas["CommentListResponse"];

// --- Captions ---------------------------------------------------------------
export type Caption = Schemas["Caption"];
export type CaptionListResponse = Schemas["CaptionListResponse"];
export type CaptionJobState = NonNullable<Schemas["CaptionJob"]["state"]>;
export type CaptionJob = Schemas["CaptionJob"];
export type CaptionJobResponse = Schemas["CaptionJobResponse"];
export type AutoCaptionRequest = Schemas["AutoCaptionRequest"];

// --- Mutes / blocks ---------------------------------------------------------
export type MutedAccount = Schemas["MutedAccount"];
export type MutedAccountListResponse = Schemas["MutedAccountListResponse"];
export type MutedInstance = Schemas["MutedInstance"];
export type MutedInstanceListResponse = Schemas["MutedInstanceListResponse"];
export type BlockInstanceRequest = Schemas["BlockInstanceRequest"];
export type BlockedInstance = Schemas["BlockedInstance"];
export type BlockedInstanceListResponse = Schemas["BlockedInstanceListResponse"];

// --- Federation / remote content --------------------------------------------
export type RemoteVideo = Schemas["RemoteVideo"];
export type CreateRemoteFollowRequest = Schemas["CreateRemoteFollowRequest"];
export type RemoteFollowState = NonNullable<Schemas["RemoteFollow"]["state"]>;
export type RemoteFollow = Schemas["RemoteFollow"];
export type RemoteFollowListResponse = Schemas["RemoteFollowListResponse"];
export type BlockedUser = Schemas["BlockedUser"];
export type BlockedUserListResponse = Schemas["BlockedUserListResponse"];

// --- ATProto / Bluesky cross-posting (P11 extension) ------------------------
// Outbound only: link a Bluesky account (handle + APP PASSWORD) so newly
// published PUBLIC videos are announced on Bluesky. The app password is
// write-only — ATProtoStatus never carries it.
export type ATProtoLinkRequest = Schemas["ATProtoLinkRequest"];
export type ATProtoStatus = Schemas["ATProtoStatus"];

// --- Messaging --------------------------------------------------------------
export type Conversation = Schemas["Conversation"];
export type ConversationSummary = Schemas["ConversationSummary"];
export type ConversationListResponse = Schemas["ConversationListResponse"];
export type Message = Schemas["Message"];
export type DMAttachmentKind = NonNullable<Schemas["DMAttachment"]["kind"]>;
export type DMAttachment = Schemas["DMAttachment"];
export type LinkPreview = Schemas["LinkPreview"];
export type UploadAttachmentResponse = Schemas["UploadAttachmentResponse"];
export type MarkConversationReadRequest = Schemas["MarkConversationReadRequest"];
export type MessageListResponse = Schemas["MessageListResponse"];

// --- End-to-end encrypted messaging (see .ralph/specs/e2ee.md) --------------
export type E2EEDevice = Schemas["E2EEDevice"];
export type E2EEDeviceListResponse = Schemas["E2EEDeviceListResponse"];
export type RegisterE2EEDeviceRequest = Schemas["RegisterE2EEDeviceRequest"];
export type E2EEOneTimeKey = Schemas["E2EEOneTimeKey"];
export type UploadOneTimeKeysRequest = Schemas["UploadOneTimeKeysRequest"];
export type UploadOneTimeKeysResponse = Schemas["UploadOneTimeKeysResponse"];
export type OneTimeKeyCountResponse = Schemas["OneTimeKeyCountResponse"];
export type E2EEClaim = Schemas["E2EEClaim"];
export type E2EEClaimResponse = Schemas["E2EEClaimResponse"];
export type EncryptedEnvelope = Schemas["EncryptedEnvelope"];
export type SendEncryptedMessageRequest = Schemas["SendEncryptedMessageRequest"];
export type SendEncryptedResponse = Schemas["SendEncryptedResponse"];
export type EncryptedMessage = Schemas["EncryptedMessage"];
export type EncryptedMessageListResponse = Schemas["EncryptedMessageListResponse"];

// --- Ratings / watch progress / history -------------------------------------
export type RatingValue = NonNullable<Schemas["VideoRating"]["my_rating"]>;
export type VideoRating = Schemas["VideoRating"];
export type WatchProgress = Schemas["WatchProgress"];
export type HistoryItem = Schemas["HistoryItem"];
export type WatchHistoryResponse = Schemas["WatchHistoryResponse"];

// --- Notifications ----------------------------------------------------------
export type NotificationType = NonNullable<Schemas["Notification"]["type"]>;
export type NotificationActor = Schemas["NotificationActor"];
export type Notification = Schemas["Notification"];
export type NotificationListResponse = Schemas["NotificationListResponse"];
export type UnreadCountResponse = Schemas["UnreadCountResponse"];

// --- Playlists --------------------------------------------------------------
export type PlaylistVisibility = NonNullable<Schemas["Playlist"]["visibility"]>;
export type Playlist = Schemas["Playlist"];
export type PlaylistListResponse = Schemas["PlaylistListResponse"];
export type PlaylistDetail = Schemas["PlaylistDetailResponse"];
export type CreatePlaylistRequest = Schemas["CreatePlaylistRequest"];
export type UpdatePlaylistRequest = Schemas["UpdatePlaylistRequest"];

// --- Statistics -------------------------------------------------------------
export type DailyViews = Schemas["DailyViews"];
export type VideoStatsResponse = Schemas["VideoStatsResponse"];
export type ChannelStatsResponse = Schemas["ChannelStatsResponse"];

// --- Storage quota ----------------------------------------------------------
export type QuotaStatus = Schemas["QuotaStatus"];

// --- Notification preferences -----------------------------------------------
export type NotificationPrefsResponse = Schemas["NotificationPrefsResponse"];
export type UpdateNotificationPrefsRequest = Schemas["UpdateNotificationPrefsRequest"];

// --- Player settings (PLAY-07) ----------------------------------------------
export type PlayerSettings = Schemas["PlayerSettings"];
export type UpdatePlayerSettingsRequest = Schemas["UpdatePlayerSettingsRequest"];

// --- Quarantine -------------------------------------------------------------
export type QuarantinedVideo = Schemas["QuarantinedVideo"];
export type QuarantinedVideoListResponse = Schemas["QuarantinedVideoListResponse"];
export type RejectQuarantinedVideoRequest = Schemas["RejectQuarantinedVideoRequest"];
