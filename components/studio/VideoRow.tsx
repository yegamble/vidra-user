"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { CaptionsManager } from "@/components/CaptionsManager";
import { ChaptersManager } from "@/components/ChaptersManager";
import { EmbedPrivacyManager } from "@/components/EmbedPrivacyManager";
import { PasswordManager } from "@/components/PasswordManager";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { ThumbnailManager } from "@/components/ThumbnailManager";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { TagsInput } from "@/components/TagsInput";
import {
  api,
  errorMessage,
  isSensitiveVideo,
  isUploadCancelled,
  resumableUpload,
  videoThumbnailUrl,
} from "@/lib/api";
import type { Video, VideoConfigResponse, VideoPrivacy } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { watchPath } from "@/lib/watch-path";

import {
  BlockedBadge,
  ROW_ACTION,
  type RowMode,
  StateBadge,
  TaxonomySelect,
  type UploadState,
  replaceErrorMessage,
  scheduleToIso,
  taxonomyFields,
  toLocalInputValue,
} from "./shared";

// VideoRow shows one of the owner's videos with inline edit (title + privacy) and
// a two-step delete confirmation. The server result is the source of truth.
export function VideoRow({
  video,
  config,
  onUpdated,
  onDeleted,
  initiallyEditing = false,
  basicOnly = false,
  replaceEnabled = false,
  replaceAccept = "video/*",
}: {
  video: Video;
  config: VideoConfigResponse | null;
  onUpdated: (v: Video) => void;
  onDeleted: () => void;
  initiallyEditing?: boolean;
  /** Privileged management edits metadata only; owner-only media tools stay hidden. */
  basicOnly?: boolean;
  /** features.video_replace (config-parity W14): shows the Replace video file flow. */
  replaceEnabled?: boolean;
  /** File-picker accept list for the replace flow (extension gate, W10). */
  replaceAccept?: string;
}) {
  const [mode, setMode] = useState<RowMode>(initiallyEditing ? "edit" : "view");
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [category, setCategory] = useState(video.category ?? "");
  const [language, setLanguage] = useState(video.language ?? "");
  const [license, setLicense] = useState(video.license ?? "");
  const [tags, setTags] = useState<string[]>(video.tags ?? []);
  // A studio (owned, local) video always carries privacy/state; the fields are
  // optional on the shared Video type only because federated remote cards omit
  // them, so coalesce to a safe default that never actually fires here.
  const [privacy, setPrivacy] = useState<VideoPrivacy>(video.privacy ?? "private");
  // Sensitive-content flag; the authoritative value arrives with the detail
  // fetch (list rows omit it), mirroring how tags are handled.
  const [sensitive, setSensitive] = useState(isSensitiveVideo(video));
  // The paired creator content-warning text (sensitive_reason, ≤280 chars). Like
  // the flag above, the authoritative value arrives with the detail fetch.
  const [sensitiveReason, setSensitiveReason] = useState(video.sensitive_reason ?? "");
  // Per-video publish policies (config-parity W9); like tags/sensitive, the
  // authoritative values arrive with the detail fetch (list rows omit them).
  const [commentsPolicy, setCommentsPolicy] = useState<"enabled" | "disabled">(
    video.comments_policy === "disabled" ? "disabled" : "enabled",
  );
  const [downloadEnabled, setDownloadEnabled] = useState(video.download_enabled !== false);
  // The number of stored passwords (CORE-17), reported up by PasswordManager
  // while privacy is "password". null = not yet known; used to block a
  // privacy=password save that has no passwords (which the server would 400).
  const [passwordCount, setPasswordCount] = useState<number | null>(null);
  // The schedule as a datetime-local value; the owner list rows carry
  // publish_at once set (per the contract), the detail fetch refreshes it.
  const [publishAt, setPublishAt] = useState(toLocalInputValue(video.publish_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The full detail fetched when Edit opens — the only view carrying hls_url/
  // renditions (list rows omit them per the contract), so the streaming-status
  // note can be honest. null until (unless) the detail fetch succeeds.
  const [detail, setDetail] = useState<Video | null>(initiallyEditing ? video : null);

  // The schedule field only exists while the video is not yet published (the
  // backend rejects publish_at on a published video); the detail state wins
  // once fetched.
  const editable = detail ?? video;
  const canSchedule = editable.state !== "published";

  async function save() {
    if (busy || title.trim() === "") return;
    // A password-protected video must have at least one password (the server
    // 400s otherwise, and would leave the video unwatchable). Block the save
    // client-side with a clear message once the count is known to be zero.
    if (privacy === "password" && passwordCount === 0) {
      setError("Add at least one password below before saving a password-protected video.");
      return;
    }
    setBusy(true);
    setError(null);
    // Send publish_at only when the (non-published) schedule actually changed —
    // re-sending an untouched past schedule would 422 ("must be in the future"),
    // and the contract has no way to clear a schedule (so empty is omitted).
    const scheduleIso = scheduleToIso(publishAt);
    const scheduleChanged =
      canSchedule &&
      scheduleIso !== undefined &&
      publishAt !== toLocalInputValue(editable.publish_at);
    try {
      const updated = await api.updateVideo(video.id, {
        title: title.trim(),
        description: description.trim(),
        privacy,
        ...taxonomyFields(category, language, license),
        // tags REPLACES the whole set (empty clears), so it is only sent when
        // the detail fetch supplied the real current set to edit from — never
        // from list-row data, which omits tags entirely.
        ...(detail ? { tags } : {}),
        // Same rule for the sensitive flag: only sent once the detail supplied
        // the real current value (list rows omit it). The paired content-warning
        // rides with it — cleared (empty string) when the flag is off.
        ...(detail
          ? { is_sensitive: sensitive, sensitive_reason: sensitive ? sensitiveReason.trim() : "" }
          : {}),
        // Same rule for the per-video publish policies (W9).
        ...(detail
          ? {
              comments_policy: commentsPolicy,
              download_enabled: downloadEnabled,
            }
          : {}),
        ...(scheduleChanged ? { publish_at: scheduleIso } : {}),
      });
      onUpdated(updated);
      setMode("view");
    } catch (err) {
      setError(errorMessage(err, "Could not update the video."));
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setMode("view");
    setTitle(video.title);
    setDescription(video.description);
    setCategory(video.category ?? "");
    setLanguage(video.language ?? "");
    setLicense(video.license ?? "");
    setTags(detail?.tags ?? video.tags ?? []);
    setPrivacy(video.privacy ?? "private");
    setSensitive(isSensitiveVideo(detail ?? video));
    setSensitiveReason((detail ?? video).sensitive_reason ?? "");
    setCommentsPolicy((detail ?? video).comments_policy === "disabled" ? "disabled" : "enabled");
    setDownloadEnabled((detail ?? video).download_enabled !== false);
    setPublishAt(toLocalInputValue((detail ?? video).publish_at));
    setError(null);
  }

  // Open the edit form pre-filled from the full video detail. The "Your videos"
  // list carries card data only (no category/language/license), so fetch the
  // detail to populate those selects; fall back to the list data if it fails.
  async function startEdit() {
    setError(null);
    try {
      const full = await api.getVideo(video.id);
      setDetail(full);
      setTitle(full.title);
      setDescription(full.description);
      setCategory(full.category ?? "");
      setLanguage(full.language ?? "");
      setLicense(full.license ?? "");
      setTags(full.tags ?? []);
      setPrivacy(full.privacy ?? "private");
      setSensitive(isSensitiveVideo(full));
      setSensitiveReason(full.sensitive_reason ?? "");
      setCommentsPolicy(full.comments_policy === "disabled" ? "disabled" : "enabled");
      setDownloadEnabled(full.download_enabled !== false);
      setPublishAt(toLocalInputValue(full.publish_at));
    } catch {
      // Keep the list-derived defaults already in state (and claim nothing
      // about streaming readiness without the detail).
    }
    setMode("edit");
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteVideo(video.id);
      onDeleted();
    } catch {
      setBusy(false);
      setMode("view");
    }
  }

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 px-4 py-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Edit title"
          maxLength={200}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Edit description"
          rows={3}
          maxLength={5000}
          className="resize-y"
        />
        <TaxonomySelect
          label="Category"
          ariaLabel="Edit category"
          value={category}
          onChange={setCategory}
          options={config?.categories ?? []}
        />
        <TaxonomySelect
          label="Language"
          ariaLabel="Edit language"
          value={language}
          onChange={setLanguage}
          options={config?.languages ?? []}
        />
        <TaxonomySelect
          label="License"
          ariaLabel="Edit license"
          value={license}
          onChange={setLicense}
          options={config?.licenses ?? []}
        />
        {/* Tags are editable only when the detail fetch supplied the current
            set (see save()); otherwise the editor would show a false empty. */}
        {detail ? <TagsInput value={tags} onChange={setTags} ariaLabel="Edit tags" /> : null}
        <Select
          label="Privacy"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
          aria-label="Edit privacy"
        >
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="private">Private</option>
          <option value="password" disabled={basicOnly && video.privacy !== "password"}>
            Password-protected
          </option>
        </Select>
        {/* Password management (CORE-17) appears when privacy is password; it
            reports its count up so the Save guard can block an empty set. */}
        {!basicOnly && privacy === "password" ? (
          <PasswordManager videoId={video.id} onCountChange={setPasswordCount} />
        ) : null}
        {/* Sensitive flag is editable only once the detail supplied the real
            current value (see save()) — a list row would show a false "off". */}
        {detail ? (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-fg">Contains sensitive content</span>
            <Toggle
              checked={sensitive}
              onChange={setSensitive}
              label="Edit contains sensitive content"
              disabled={busy}
            />
          </div>
        ) : null}
        {/* Paired content-warning, revealed only while the flag is on; clearing
            it (empty) removes the reason on save. */}
        {detail && sensitive ? (
          <Input
            label="Content warning (optional)"
            value={sensitiveReason}
            onChange={(e) => setSensitiveReason(e.target.value)}
            aria-label="Edit content warning"
            placeholder="Briefly describe what viewers will see"
            maxLength={280}
            disabled={busy}
          />
        ) : null}
        {/* Per-video publish policies (config-parity W9): same detail-gated
            rule as the sensitive flag. */}
        {detail ? (
          <>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-fg">Allow comments</span>
              <Toggle
                checked={commentsPolicy === "enabled"}
                onChange={(on) => setCommentsPolicy(on ? "enabled" : "disabled")}
                label="Edit allow comments"
                disabled={busy}
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-fg">Allow downloads</span>
              <Toggle
                checked={downloadEnabled}
                onChange={setDownloadEnabled}
                label="Edit allow downloads"
                disabled={busy}
              />
            </div>
          </>
        ) : null}
        {canSchedule ? (
          // Scheduling is only editable while the video has not published yet —
          // the backend rejects publish_at on a published video, and a schedule
          // cannot be cleared through the contract (only moved).
          <Input
            label="Scheduled publish"
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-label="Edit scheduled publish"
            hint="Set or move the automatic publish time (must be in the future)."
          />
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {detail ? <StreamingStatus video={detail} /> : null}
        {!basicOnly ? (
          <>
            {/* Video file replacement (config-parity W14): feature-gated and
                only offered for a published video — anything else the server
                would refuse with 409 replace_conflict anyway. */}
            {replaceEnabled && editable.state === "published" ? (
              <ReplaceVideoManager
                videoId={video.id}
                accept={replaceAccept}
                onReplaced={onUpdated}
              />
            ) : null}
            <ThumbnailManager
              videoId={video.id}
              hasThumbnail={video.has_thumbnail ?? false}
              hasStoryboard={(detail ?? video).has_storyboard ?? false}
              durationSeconds={(detail ?? video).duration_seconds ?? undefined}
            />
            <CaptionsManager videoId={video.id} />
            <ChaptersManager
              videoId={video.id}
              durationSeconds={(detail ?? video).duration_seconds ?? undefined}
            />
            <EmbedPrivacyManager videoId={video.id} />
          </>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || title.trim() === ""} onClick={() => void save()}>
            Save
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={cancelEdit}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* Design row thumbnail: poster when ready, else a plain surface tile; a
          spinner overlays while the backend is still transcoding. */}
      <div className="relative aspect-video w-[92px] shrink-0 overflow-hidden rounded-lg bg-surface-strong sm:w-28">
        {video.has_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={videoThumbnailUrl(video.id)} alt="" className="h-full w-full object-cover" />
        ) : null}
        {video.state === "processing" ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45">
            <LoaderIcon size={18} className="animate-spin text-white" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          <Link href={watchPath(video)} className="hover:underline">
            {video.title}
          </Link>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <StateBadge state={video.state ?? "draft"} />
          {video.blocked ? <BlockedBadge /> : null}
          {video.privacy === "public" ? (
            <span className="text-fg-muted">Public</span>
          ) : (
            <PrivacyBadge privacy={video.privacy ?? "private"} />
          )}
          {video.state === "scheduled" && video.publish_at ? (
            <span className="text-fg-muted tabular-nums">
              publishes {formatDateTime(video.publish_at)}
            </span>
          ) : null}
        </div>
        {video.state === "quarantined" ? (
          <p className="mt-1 text-xs text-warning">
            Held for review — this instance reviews new uploads before they go public. Only you and
            the moderators can see it until it is approved.
          </p>
        ) : null}
        {video.blocked ? (
          <p className="mt-1 text-xs text-danger">
            Blocked by moderation — this video is not available to viewers, including you, until a
            moderator lifts the block. Nothing else about it has changed.
          </p>
        ) : null}
      </div>
      {mode === "confirm-delete" ? (
        <div className="flex shrink-0 items-center gap-1 text-sm">
          <span className="text-[13px] text-fg-muted">Delete?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className={`${ROW_ACTION} text-danger hover:bg-danger-surface`}
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("view")}
            className={`${ROW_ACTION} text-fg-muted hover:bg-surface-strong hover:text-fg`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => void startEdit()}
            className={`${ROW_ACTION} text-fg-muted hover:bg-surface-strong hover:text-fg`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm-delete")}
            className={`${ROW_ACTION} text-fg-muted hover:bg-danger-surface hover:text-danger`}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

// ReplaceVideoManager is the edit-surface "Replace video file" flow
// (config-parity W14, feature-gated by features.video_replace): pick a new
// source, upload it through the resumable replace-session machinery with
// chunk-accurate progress, and hand the still-published video back to the row.
// Viewers keep watching the current version until the replacement finishes
// processing — the note says so honestly.
// Exported for tests (the W14 replace-flow coverage renders it directly).
export function ReplaceVideoManager({
  videoId,
  accept,
  onReplaced,
}: {
  videoId: string;
  accept: string;
  onReplaced: (v: Video) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  function onPicked() {
    setError(null);
    if (state === "done") setState("idle");
    const file = fileRef.current?.files?.[0];
    setFileName(file ? file.name : null);
  }

  async function replace() {
    const file = fileRef.current?.files?.[0];
    if (!file || state === "uploading") return;
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = null;
    setState("uploading");
    setProgress(0);
    setError(null);
    try {
      const res = await resumableUpload(videoId, file, {
        mode: "replace",
        onProgress: (p) => setProgress(p.percent),
        signal: controller.signal,
        onSessionOpened: (id) => {
          sessionIdRef.current = id;
        },
      });
      setState("done");
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      onReplaced(res.video);
    } catch (err) {
      if (isUploadCancelled(err)) {
        // Cancel drops the replace session (and its chunks); the video keeps
        // its current source untouched.
        if (sessionIdRef.current)
          void api.cancelUploadSession(sessionIdRef.current).catch(() => {});
        setState("cancelled");
        return;
      }
      setError(replaceErrorMessage(err));
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-subtle p-3 text-sm">
      <span className="font-medium text-fg">Replace video file</span>
      <p className="text-xs text-fg-muted">
        Upload a new file for this video. Its link, views, and details stay the same; viewers keep
        watching the current version until the new file finishes processing.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          aria-label="Replacement video file"
          onChange={onPicked}
          disabled={state === "uploading"}
          className="min-w-0 flex-1 text-xs text-fg-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-strong file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fg"
        />
        {state === "uploading" ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label="Cancel replacement upload"
            onClick={() => abortRef.current?.abort()}
          >
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={fileName === null}
            onClick={() => void replace()}
            aria-label="Upload replacement"
          >
            Replace
          </Button>
        )}
      </div>
      {state === "uploading" ? (
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label="Replacement upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-strong"
          >
            <div
              className="h-full rounded-full bg-fg transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span aria-hidden="true" className="text-xs font-semibold tabular-nums text-fg-muted">
            {progress}%
          </span>
        </div>
      ) : null}
      {state === "done" ? (
        <p role="status" className="text-xs text-success">
          New file uploaded — viewers see the current version until processing finishes.
        </p>
      ) : null}
      {state === "error" && error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

// StreamingStatus is the honest transcoding note on the edit surface. The
// contract exposes exactly one signal: the DETAIL response carries hls_url (+
// renditions) once the transcoded HLS ladder is ready, and omits it while
// transcoding is pending, failed, or disabled on the instance — there is no
// queue/progress state to show, and list rows omit the field entirely (which is
// why this lives here, where the detail is already fetched, and not as an
// N+1-fetch row badge). Only published videos are annotated: a draft has no
// file and processing/failed already have their own badges.
function StreamingStatus({ video }: { video: Video }) {
  if (video.state !== "published") return null;
  if (video.hls_url) {
    const heights = (video.renditions ?? []).map((r) => `${r.height}p`).join(", ");
    return (
      <p className="text-xs text-fg-muted">Streaming (HLS) ready{heights ? `: ${heights}` : ""}.</p>
    );
  }
  return (
    <p className="text-xs text-fg-muted">
      HD streaming versions are not ready — viewers currently watch the original file. They appear
      automatically once transcoding completes (if enabled on this instance).
    </p>
  );
}
