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
/** First-run owner claim: the setup-token redemption body (see lib/owner-claim.ts). */
export type ClaimOwnerRequest = Schemas["ClaimOwnerRequest"];
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
export type VideoDownloadFile = Schemas["VideoDownloadFile"];
export type VideoDownloadResponse = Schemas["VideoDownloadResponse"];

// --- Playback session + QoE (phase-4 delivery items 1, 4, 7) ----------------
// ONE session object for both subjects: POST /videos/{id}/playback-session and
// POST /live/{id}/playback-session answer the same schema, carrying video_id or
// live_stream_id (exactly one) — which is what lets a player consume a session
// the same way whichever it is playing. See lib/playback-session.ts.
export type PlaybackSession = Schemas["PlaybackSession"];
export type PlaybackPackagingFormat = NonNullable<PlaybackSession["packaging_format"]>;
// One playback measurement for POST /qoe/events (batched from lib/playback-qoe.ts).
// Note what the schema does NOT have: a delivery_source. The client reports the
// URL it fetched from and the SERVER classifies it, which is what keeps that
// dimension bounded — see lib/playback-qoe.ts.
export type QoEEventInput = Schemas["QoEEventInput"];
export type QoEEventType = QoEEventInput["type"];
export type QoEErrorClass = NonNullable<QoEEventInput["error_class"]>;
// `QoEEngine` and `QoEPackagingFormat` are one closed vocabulary shared by the
// beacon that writes these events and the rollups that read them, so they are
// declared once — in the admin block below, projected off the rollup schema.

// --- Search & discovery (search-service W4) ---------------------------------
// Autocomplete suggestions. The response is inline in the spec (not a named
// component), so it is derived from the operation. `type` is a string in the
// contract; the union below is the client-side allowlist we branch navigation on.
export type SearchSuggestionsResponse =
  operations["searchSuggestions"]["responses"]["200"]["content"]["application/json"];
export type SearchSuggestion = SearchSuggestionsResponse["suggestions"][number];
export type SearchSuggestionType = "query" | "video" | "channel" | "tag" | "history";
// The entity searches. Both are ordinary paged lists over types the app already
// renders: channel hits are plain `Channel` objects, and an account hit is a
// strict subset of `PublicUserProfile` — so a result card is the profile card,
// not a search-only projection modelled twice.
export type ChannelSearchResponse = Schemas["ChannelSearchResponse"];
export type AccountSearchResponse = Schemas["AccountSearchResponse"];
export type AccountSearchResult = Schemas["AccountSearchResult"];
// A home / related recommendation rail: video cards each carrying a `reason`.
export type RecommendationsResponse = Schemas["RecommendationsResponse"];
export type RecommendationItem = RecommendationsResponse["items"][number];
export type RecommendationSource = NonNullable<RecommendationsResponse["source"]>;
// The caller's stored search history (GET /me/search-history). Inline in the
// spec, derived from the operation.
export type SearchHistoryResponse =
  operations["getMySearchHistory"]["responses"]["200"]["content"]["application/json"];
export type SearchHistoryEntry = NonNullable<SearchHistoryResponse["entries"]>[number];
// The behavioural events POST /search/events accepts. The spec's body schema
// only pins `type` (the allowlist is enforced server-side and additional
// properties are forwarded), so the client type is authored here: a discriminated
// bag whose optional fields carry ONLY ids/positions/counts — never query text
// beyond the search term the user typed, and no other PII. See lib/search-events.ts.
export type SearchEventType =
  | "search.suggestions_shown"
  | "search.suggestion_selected"
  | "search.submitted"
  | "search.result_clicked"
  | "video.impression"
  | "video.play_started"
  | "video.completed";
export interface SearchEventInput {
  type: SearchEventType;
  /** The raw prefix/query the user typed (allowed — it is their own search term). */
  query?: string;
  /** The chosen suggestion's text (suggestion_selected). */
  suggestion?: string;
  /** Suggestion/result type: query | video | channel | tag | history. */
  suggestion_type?: string;
  video_id?: string;
  /** 0-based position in a suggestion list / result list / rail. */
  position?: number;
  /** Number of suggestions shown (suggestions_shown). */
  count?: number;
  /** Play/impression surface: home | search | related | watch | other. */
  context?: string;
  /** Ranking model version echoed back from a result set, when known. */
  model_version?: string;
}

// --- Users / auth -----------------------------------------------------------
export type UserRole = NonNullable<Schemas["User"]["role"]>;
export type AdminUser = Schemas["AdminUser"];
export type AdminUserListResponse = Schemas["AdminUserListResponse"];
export type AuditLogEntry = Schemas["AuditLogEntry"];
export type AuditLogListResponse = Schemas["AuditLogListResponse"];
export type SystemStatusComponent = Schemas["ComponentStatus"];
export type SystemStatus = Schemas["SystemStatus"];
// The live connection-pool sample. OPTIONAL on the wire and unwrapped here on
// purpose: the server omits the block entirely when no pool is attached (0 of 0
// connections cannot be told apart from a pool with nothing left), so the
// presence check belongs at the call site, not inside every field read.
export type SystemStatusDatabase = NonNullable<SystemStatus["database"]>;
// The effective rate-limit configuration. Read-only surfacing by decision:
// rate limits are deploy-time env (RATE_LIMIT_* / AUTH_RATE_LIMIT_*), so the
// page confirms what applied and offers no control.
export type SystemStatusRateLimits = SystemStatus["rate_limits"];
// The CDN purge counters. OPTIONAL on the wire and unwrapped here like the
// database block: the server omits it entirely when no CDN is wired — zero
// runs on an edgeless install would read as a purge system that never works.
export type SystemStatusCdnPurge = NonNullable<SystemStatus["cdn_purge"]>;
// The deploy-time shape (GET /admin/infrastructure) — what the operator chose
// at install time, as opposed to SystemStatus's live health. Section types are
// projected off the parent because the spec declares them inline (no named
// component to alias), which keeps them in lockstep with codegen.
export type InfrastructureStatus = Schemas["InfrastructureStatus"];
export type InfrastructureServer = InfrastructureStatus["server"];
export type InfrastructureStorage = InfrastructureStatus["storage"];
export type InfrastructureNetworking = InfrastructureStatus["networking"];
export type InfrastructureBackups = InfrastructureStatus["backups"];
// Optional deploy-shape blocks, unwrapped like SystemStatusDatabase: the
// server omits delivery when no CDN is wired and live when FEATURE_LIVE is
// off, so the presence check belongs at the call site.
export type InfrastructureDelivery = NonNullable<InfrastructureStatus["delivery"]>;
export type InfrastructureLive = NonNullable<InfrastructureStatus["live"]>;
export type InfrastructureFeature = Schemas["InfrastructureFeature"];
export type MailTestResult = Schemas["MailTestResult"];
export type AdminStats = Schemas["AdminStats"];
export type UpdateUserRequest = Schemas["UpdateUserRequest"];

// --- Admin: instance settings / jobs / media GB (slice user-admin-config) ----
export type InstanceSetting = Schemas["InstanceSetting"];
export type InstanceSettingType = NonNullable<Schemas["InstanceSetting"]["type"]>;
export type InstanceSettingsResponse = Schemas["InstanceSettingsResponse"];
export type UpdateInstanceSettingsRequest = Schemas["UpdateInstanceSettingsRequest"];
// Dry-run validation (POST /admin/instance-settings/validate). An issue is the
// SAME {field, message} shape the PATCH's 422 carries, deliberately, so the
// config form renders early answers and save-time rejections through one path.
export type SettingValidationIssue = Schemas["SettingValidationIssue"];
export type InstanceSettingsValidationResponse =
  Schemas["InstanceSettingsValidationResponse"];
// Instance documents (config-parity W1 store, W6 editors). Hand-written: the
// shape is fixed by .ralph/specs/config-parity/instance-contract.md so the
// editors do not depend on the generated spec snapshot in use.
export type InstanceDocumentName = "homepage" | "custom_css" | "custom_js";
/** One document's stored state; body "" + hash "" when never set / cleared. */
export type InstanceDocument = {
  name: InstanceDocumentName;
  body: string;
  hash: string;
};
export type JobsOverview = Schemas["JobsOverview"];
export type QueueStatus = Schemas["QueueStatus"];
export type JobFailure = Schemas["JobFailure"];
export type JobRunState = Schemas["JobRunState"];
export type JobMetadata = Schemas["JobMetadata"];
export type JobRun = Schemas["JobRun"];
export type JobEvent = Schemas["JobEvent"];
export type JobRunsResponse = Schemas["JobRunsResponse"];
export type JobRunDetailResponse = Schemas["JobRunDetailResponse"];
export type MediaGCResponse = Schemas["MediaGCResponse"];
// The collector's boot facts (GET /admin/media/gc): enabled + the breaker limit
// are boot-baked and read-only; bucket_ownership is live in-memory state.
export type MediaGCConfig = Schemas["MediaGCConfig"];
export type MediaGCAdoptBucketResponse = Schemas["MediaGCAdoptBucketResponse"];
// Media-store migration campaigns (GET /admin/storage/migrations). The state
// union is projected off the schema rather than re-typed so a new phase added
// core-side becomes a compile error here instead of a silently unhandled label.
export type StorageMigration = Schemas["StorageMigration"];
export type StorageMigrationState = StorageMigration["state"];
export type StorageMigrationList = Schemas["StorageMigrationList"];
export type IPFSStatus = Schemas["IPFSStatus"];
export type IPFSNetworks = Schemas["IPFSNetworks"];
export type IPFSNetworkStatus = Schemas["IPFSNetworkStatus"];
export type IPFSPinCounts = Schemas["IPFSPinCounts"];
export type IPFSClassPinCounts = Schemas["IPFSClassPinCounts"];
export type IPFSReconcileResult = Schemas["IPFSReconcileResult"];

// --- Admin: playback quality (phase-4 delivery item 4) ----------------------
// GET /admin/qoe/playback-health. Two projections in one payload: `sources` is
// the phase-4 exit criterion (one merged row per delivery source over the whole
// window, percentiles recomputed from the summed histograms and therefore never
// paged), `buckets` the hourly detail behind it.
//
// The four dimension unions are projected off the schema rather than re-typed
// so a vocabulary member added core-side becomes a compile error in the label
// maps (lib/playback-health.ts) instead of a raw snake_case string on screen.
export type QoEPlaybackHealth = Schemas["QoEPlaybackHealth"];
export type QoESourceSummary = Schemas["QoESourceSummary"];
export type QoEBucket = Schemas["QoEBucket"];
export type QoEPercentiles = Schemas["QoEPercentiles"];
export type QoEDeliverySource = NonNullable<QoESourceSummary["delivery_source"]>;
export type QoEEngine = NonNullable<QoEBucket["engine"]>;
export type QoEPackagingFormat = NonNullable<QoEBucket["packaging_format"]>;

// --- Admin: PeerTube import / migration (P10 UI over P18 backend) ------------
export type PeerTubeImportLaunchRequest = Schemas["PeerTubeImportLaunchRequest"];
export type PeerTubeImportMode = NonNullable<Schemas["PeerTubeImportLaunchRequest"]["mode"]>;
export type PeerTubeImportConflictPolicy = NonNullable<
  Schemas["PeerTubeImportLaunchRequest"]["conflict_policy"]
>;
/**
 * What a run does with the source's media objects. A LAUNCH may name one of
 * three; a RUN may additionally report "" — it was launched before core
 * recorded the mode, and the server default of the day was stored nowhere. The
 * two are deliberately separate types so nothing can put "" on the wire as a
 * choice, and nothing can read a recorded mode as if it were always one of the
 * three.
 */
export type PeerTubeImportMediaMode = NonNullable<
  Schemas["PeerTubeImportLaunchRequest"]["media_mode"]
>;
export type PeerTubeImportRunMediaMode = NonNullable<Schemas["PeerTubeImportRun"]["media_mode"]>;
export type PeerTubeImportCounts = Schemas["PeerTubeImportCounts"];
export type PeerTubeImportReport = Schemas["PeerTubeImportReport"];
export type PeerTubeImportRun = Schemas["PeerTubeImportRun"];
export type PeerTubeImportRunState = NonNullable<Schemas["PeerTubeImportRun"]["state"]>;
export type PeerTubeImportRunList = Schemas["PeerTubeImportRunList"];

export type RegistrationRequestStatus = NonNullable<Schemas["RegistrationRequest"]["status"]>;
/** GET /admin/registration-requests `?status` — the lifecycle enum plus "all". */
export type RegistrationRequestFilter = NonNullable<
  NonNullable<operations["listRegistrationRequests"]["parameters"]["query"]>["status"]
>;
export type RegistrationRequest = Schemas["RegistrationRequest"];
export type RegistrationRequestListResponse = Schemas["RegistrationRequestListResponse"];
export type RejectRegistrationRequest = Schemas["RejectRegistrationRequest"];
export type FederationFollowerRequest = Schemas["FederationFollowerRequest"];
export type FederationFollowerRequestListResponse =
  Schemas["FederationFollowerRequestListResponse"];
export type User = Schemas["User"];
export type PublicUserProfile = Schemas["PublicUserProfile"];
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
export type ChangePasswordRequest = Schemas["ChangePasswordRequest"];
export type EmailChangeRequest = Schemas["EmailChangeRequest"];
export type EmailChangeState = Schemas["EmailChangeState"];
export type EmailChangeConfirmRequest = Schemas["EmailChangeConfirmRequest"];
export type EmailChangeConfirmed = Schemas["EmailChangeConfirmed"];
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
/** The per-follow notification bell: "all" = every new public video, "none" = muted. */
export type NotificationSetting = NonNullable<Schemas["Channel"]["notification_setting"]>;
export type SetFollowNotificationsRequest = Schemas["SetFollowNotificationsRequest"];
export type FollowNotificationsResponse = Schemas["FollowNotificationsResponse"];
// The caller's role on a channel (GET /me/channels only): "owner" or "editor".
export type ChannelRole = NonNullable<Schemas["Channel"]["role"]>;

// --- Channel collaborators (editors, migration 0097) ------------------------
export type ChannelMember = Schemas["ChannelMember"];
export type ChannelMembersResponse = Schemas["ChannelMembersResponse"];
export type AddChannelMemberRequest = Schemas["AddChannelMemberRequest"];

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
/** GET /admin/reports `?status` — the real three-way enum, not a boolean. */
export type ReportStatusFilter = NonNullable<
  NonNullable<operations["listReports"]["parameters"]["query"]>["status"]
>;
export type AdminVideo = Schemas["AdminVideo"];
export type AdminVideoListResponse = Schemas["AdminVideoListResponse"];
/** The 18-key ordering enum GET /admin/videos accepts (`published_at` aliases `created_at`). */
export type AdminVideoSort = NonNullable<
  NonNullable<operations["listAdminVideos"]["parameters"]["query"]>["sort"]
>;
/** GET /admin/videos `?scope` — local rows, federated rows, or both. */
export type AdminVideoScope = NonNullable<
  NonNullable<operations["listAdminVideos"]["parameters"]["query"]>["scope"]
>;
export type AdminComment = Schemas["AdminComment"];
export type AdminCommentListResponse = Schemas["AdminCommentListResponse"];
export type WatchedWord = Schemas["WatchedWord"];
export type WatchedWordListResponse = Schemas["WatchedWordListResponse"];
export type CreateWatchedWordRequest = Schemas["CreateWatchedWordRequest"];
export type WatchedWordMatch = Schemas["WatchedWordMatch"];
export type WatchedWordMatchListResponse = Schemas["WatchedWordMatchListResponse"];
/** One query suppressed from instance-wide autosuggest, with its aggregate evidence. */
export type SuggestionBanEntry = Schemas["SuggestionBanEntry"];
/**
 * The suggestion-ban page. Deliberately has NO `total`: the search service
 * reports the window it returned and nothing more, so no surface may render a
 * count of banned queries.
 */
export type SuggestionBanListResponse = Schemas["SuggestionBanListResponse"];
/** The ban confirmation — `normalized_query` is the key a later unban must target. */
export type SuggestionBanResponse = Schemas["SuggestionBanResponse"];

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
// DM privacy toggles (GET/PATCH /api/v1/me/messaging-prefs). Today just the
// read-receipts switch: core DEFAULTS it on and hides the caller's read
// watermark from peers when it is off, so this is the opt-out behind the
// "Seen" marker MessageBubble renders.
export type MessagingPrefs = Schemas["MessagingPrefs"];
export type UpdateMessagingPrefsRequest = Schemas["UpdateMessagingPrefsRequest"];

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
// Account-level rollup (GET /me/stats): totals summed across all OWNED channels,
// the aggregated 30-day daily series, and a per-channel breakdown row per channel.
export type AccountStatsResponse = Schemas["AccountStatsResponse"];
export type AccountChannelStats = Schemas["AccountChannelStats"];

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
