"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BatchUploadQueue } from "@/components/BatchUploadQueue";
import { CaptionsManager } from "@/components/CaptionsManager";
import { ChannelSyncSection } from "@/components/ChannelSyncSection";
import { ChaptersManager } from "@/components/ChaptersManager";
import { EmbedPrivacyManager } from "@/components/EmbedPrivacyManager";
import { LiveStreamsSection } from "@/components/LiveStreamsSection";
import { PasswordManager } from "@/components/PasswordManager";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { ProfileImageManager } from "@/components/ProfileImageManager";
import { StudioStorageCard } from "@/components/StudioStorageCard";
import { TagsInput } from "@/components/TagsInput";
import { ThumbnailManager } from "@/components/ThumbnailManager";
import { UploadRecoveryCard } from "@/components/UploadRecoveryCard";
import { useSession } from "@/components/auth/AuthProvider";
import { CheckIcon, ChevronDownIcon, LoaderIcon, UploadIcon } from "@/components/icons";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import {
  ApiError,
  api,
  channelAvatarUrl,
  channelBannerUrl,
  errorMessage,
  findResumableUploadSession,
  forgetUploadSession,
  isSensitiveVideo,
  isUploadCancelled,
  resumableUpload,
  videoThumbnailUrl,
} from "@/lib/api";
import type {
  Channel,
  ImportJob,
  StoredUploadSession,
  UploadVideoResult,
  Video,
  VideoConfigOption,
  VideoConfigResponse,
  VideoPrivacy,
  VideoState,
} from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  IMPORT_STAGES,
  importActiveStage,
  importResolved,
  isImportsDisabledError,
} from "@/lib/import-status";

type Status = "loading" | "error" | "ready";

// Token recipes for the hand-written form fields in this file (the upload form
// keeps bespoke markup for its per-field 422 wiring; these mirror the ui
// primitives' styling so both render identically).
const FIELD =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";
const SELECT_FIELD =
  "w-full appearance-none rounded-xl border border-border bg-surface px-3.5 py-2 pr-9 text-sm text-fg focus-ring disabled:opacity-60";
// Quiet pill treatment for inline row actions (Edit / Delete / Confirm / Cancel).
const ROW_ACTION =
  "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus-ring disabled:opacity-50";

// StudioView is the creator surface: create a channel, then upload a video to it.
// The session lives in memory, so a hard reload lands here signed out.
export function StudioView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to use the studio"
        message={
          <>
            <Link href="/login" className="underline hover:text-fg">
              Sign in
            </Link>{" "}
            to create a channel and publish videos.
          </>
        }
      />
    );
  }

  return <Studio />;
}

function Studio() {
  const [status, setStatus] = useState<Status>("loading");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped when a draft-recovery resume finishes, to remount MyVideosSection so
  // the just-published video appears without a manual Reload.
  const [videoReloadKey, setVideoReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyChannels(controller.signal)
      .then((res) => {
        setChannels(res.channels);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  // The metadata taxonomy is static; load it once (non-blocking — the selects
  // just render their options once it arrives).
  useEffect(() => {
    const controller = new AbortController();
    api.getVideoConfig(controller.signal).then(setConfig).catch(() => {});
    return () => controller.abort();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your studio" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load your studio."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  // The upload/my-videos sections default their selected channel to channels[0];
  // remount them when the set of channels changes (create/delete) so a stale
  // selection can't point at a channel that no longer exists. Editing a channel
  // keeps its id, so this key is stable across edits.
  const channelsKey = channels.map((c) => c.id).join(",");

  return (
    <div className="flex flex-col gap-8">
      <StudioStorageCard />
      <UploadRecoveryCard onResumed={() => setVideoReloadKey((k) => k + 1)} />
      <ChannelSection
        channels={channels}
        onCreated={(ch) => setChannels((list) => [ch, ...list])}
        onUpdated={(ch) => setChannels((list) => list.map((c) => (c.id === ch.id ? ch : c)))}
        onDeleted={(id) => setChannels((list) => list.filter((c) => c.id !== id))}
      />
      {channels.length > 0 ? (
        <ChannelSyncSection key={`sync-${channelsKey}`} channels={channels} />
      ) : null}
      {channels.length > 0 ? (
        // #upload / #go-live anchors are the landing targets for the phone Create
        // sheet's rows; scroll-mt clears the sticky app header.
        <div id="upload" className="scroll-mt-20">
          <UploadSection
            key={`upload-${channelsKey}`}
            channels={channels}
            config={config}
            onUploaded={() => setVideoReloadKey((k) => k + 1)}
          />
        </div>
      ) : null}
      {channels.length > 0 ? (
        <MyVideosSection
          key={`videos-${channelsKey}-${videoReloadKey}`}
          channels={channels}
          config={config}
        />
      ) : null}
      {channels.length > 0 ? (
        <div id="go-live" className="scroll-mt-20">
          <LiveStreamsSection key={`live-${channelsKey}`} channels={channels} />
        </div>
      ) : null}
    </div>
  );
}

function ChannelSection({
  channels,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  channels: Channel[];
  onCreated: (ch: Channel) => void;
  onUpdated: (ch: Channel) => void;
  onDeleted: (id: string) => void;
}) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || handle.trim() === "" || displayName.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const ch = await api.createChannel({ handle: handle.trim(), display_name: displayName.trim() });
      onCreated(ch);
      setHandle("");
      setDisplayName("");
    } catch (err) {
      setError(
        errorMessage(err, "Could not create the channel.", {
          "409": "That handle is already taken.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-bold tracking-tight">Your channels</h2>
      {channels.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Create your first channel to start publishing.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {channels.map((ch) => (
            <ChannelRow key={ch.id} channel={ch} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="sm:w-48">
          <Input
            label="Handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="ada_makes"
            aria-label="Channel handle"
            minLength={3}
            maxLength={30}
          />
        </div>
        <div className="flex-1">
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ada Makes"
            aria-label="Channel display name"
            maxLength={50}
          />
        </div>
        <Button
          type="submit"
          disabled={busy || handle.trim() === "" || displayName.trim() === ""}
        >
          Create channel
        </Button>
      </form>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}

// ChannelRow renders one owned channel with inline Edit (display name +
// description → PATCH /channels/:handle) and a two-step Delete (→ DELETE, which
// cascades to the channel's videos). The server result is the source of truth.
function ChannelRow({
  channel,
  onUpdated,
  onDeleted,
}: {
  channel: Channel;
  onUpdated: (ch: Channel) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<RowMode>("view");
  const [displayName, setDisplayName] = useState(channel.display_name);
  const [description, setDescription] = useState(channel.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (displayName.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateChannel(channel.handle, {
        display_name: displayName.trim(),
        description: description.trim(),
      });
      onUpdated(updated);
      setMode("view");
    } catch (err) {
      setError(errorMessage(err, "Could not save the channel."));
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setMode("view");
    setDisplayName(channel.display_name);
    setDescription(channel.description);
    setError(null);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteChannel(channel.handle);
      onDeleted(channel.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete the channel."));
      setBusy(false);
      setMode("view");
    }
  }

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 px-4 py-4">
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-label="Edit channel name"
          maxLength={50}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Edit channel description"
          rows={3}
          maxLength={1000}
          className="resize-y"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <ProfileImageManager
          kind="avatar"
          label="Channel avatar"
          name={channel.display_name || channel.handle}
          has={channel.has_avatar ?? false}
          src={channelAvatarUrl(channel.handle)}
          upload={(file) => api.setChannelAvatar(channel.handle, file)}
          remove={() => api.deleteChannelAvatar(channel.handle)}
          onChanged={(has) => onUpdated({ ...channel, has_avatar: has })}
        />
        <ProfileImageManager
          kind="banner"
          label="Channel banner"
          name={channel.display_name || channel.handle}
          has={channel.has_banner ?? false}
          src={channelBannerUrl(channel.handle)}
          upload={(file) => api.setChannelBanner(channel.handle, file)}
          remove={() => api.deleteChannelBanner(channel.handle)}
          onChanged={(has) => onUpdated({ ...channel, has_banner: has })}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy || displayName.trim() === ""}
            onClick={() => void save()}
          >
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          <Link href={`/channels/${channel.handle}`} className="hover:underline">
            {channel.display_name}
          </Link>
        </p>
        <span className="text-[13px] text-fg-muted">@{channel.handle}</span>
      </div>
      {mode === "confirm-delete" ? (
        <div className="flex shrink-0 items-center gap-1 text-sm">
          <span className="text-[13px] text-fg-muted">Delete channel?</span>
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
            aria-label={`Edit ${channel.handle}`}
            onClick={() => setMode("edit")}
            className={`${ROW_ACTION} text-fg-muted hover:bg-surface-strong hover:text-fg`}
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete ${channel.handle}`}
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

type UploadState = "idle" | "uploading" | "done" | "cancelled" | "error";

// FieldErrorText renders an inline field-level validation message (the target of
// the input's aria-describedby), matching the SignupForm pattern.
function FieldErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-danger">
      {message}
    </p>
  );
}

// TaxonomySelect renders a labelled dropdown for an optional metadata field. An
// empty value ("—") means unset. When a 422 field error targets it, `error` +
// `errorId` wire the inline message via aria-invalid/aria-describedby.
function TaxonomySelect({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  error,
  errorId,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: VideoConfigOption[];
  error?: string;
  errorId?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-fg">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
          className={SELECT_FIELD}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </span>
      {errorId ? <FieldErrorText id={errorId} message={error} /> : null}
    </label>
  );
}

// taxonomyFields builds the optional metadata part of a create/update request,
// including only the non-empty selections. Empty is omitted (not sent as ""),
// which both keeps create payloads clean and avoids the backend's 422 on an
// empty taxonomy value in a PATCH.
function taxonomyFields(category: string, language: string, license: string) {
  const out: { category?: string; language?: string; license?: string } = {};
  if (category) out.category = category;
  if (language) out.language = language;
  if (license) out.license = license;
  return out;
}

// toLocalInputValue formats an ISO timestamp as a datetime-local input value
// (YYYY-MM-DDTHH:MM in the viewer's local zone); "" when absent/unparseable.
function toLocalInputValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// scheduleToIso converts a datetime-local value (interpreted in the viewer's
// local zone) to the ISO instant the API expects; undefined when empty/invalid
// (an invalid value is left for the backend's 422 to explain, so the field is
// never silently dropped — but browsers keep datetime-local well-formed).
function scheduleToIso(local: string): string | undefined {
  if (local.trim() === "") return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// importOrUploadError maps a publish failure to a friendly message, tailored to
// whether the source was a file upload or a URL import.
function importOrUploadError(err: unknown, source: "file" | "url"): string {
  if (err instanceof ApiError) {
    if (err.status === 415) return "That is not a supported video type.";
    if (err.status === 413) return "That file is too large.";
    if (err.code === "quota_exceeded") {
      return "This upload would exceed your storage quota. Free up space or remove older videos and try again.";
    }
    if (source === "url" && err.status === 422) {
      return "Couldn't fetch that URL — it must be a public link to a video file.";
    }
  }
  // Network / rate-limit / 5xx get the shared friendly copy; a truly unknown
  // failure gets the source-specific default.
  return errorMessage(
    err,
    source === "url" ? "Import failed. Please try again." : "Upload failed. Please try again.",
  );
}

// failedStateError is the message for an upload/import whose HTTP call succeeded
// but whose returned video came back state="failed" (the backend's probe/scan
// rejected the file) — a dead upload must never be reported as published.
function failedStateError(source: "file" | "url"): string {
  return source === "url"
    ? "Processing failed — the imported file could not be published. Check that the URL points to a valid video file and try again."
    : "Processing failed — the file could not be published. Check that it is a valid video file and try again.";
}

// The publish-form fields that can carry an inline 422 message, keyed by the
// backend's field names (create-draft: title/description/privacy/taxonomy;
// import: url).
const PUBLISH_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "description",
  "privacy",
  "category",
  "language",
  "license",
  "publish_at",
  "url",
]);

// How often the async URL-import job is polled for progress.
const IMPORT_POLL_INTERVAL_MS = 2000;

// uploadCancelled builds the same cancellation ApiError the upload layer throws
// (status 0 + the "upload_cancelled" code), so a cancelled import poll is
// recognised by isUploadCancelled exactly like an aborted chunk upload.
function uploadCancelled(): ApiError {
  return new ApiError({ status: 0, code: "upload_cancelled", message: "upload cancelled" });
}

// sleep resolves after ms, or rejects as a cancellation when the signal aborts.
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(uploadCancelled());
    const onAbort = () => {
      clearTimeout(timer);
      reject(uploadCancelled());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function UploadSection({
  channels,
  config,
  onUploaded,
}: {
  channels: Channel[];
  config: VideoConfigResponse | null;
  onUploaded?: () => void;
}) {
  const [handle, setHandle] = useState(channels[0]?.handle ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [license, setLicense] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<VideoPrivacy>("public");
  // Sensitive-content flag (spec: instance-platform-info.md): travels as
  // is_sensitive on the create-draft body so the instance policy (hide/warn/
  // blur/display) can apply to the published video.
  const [sensitive, setSensitive] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [source, setSource] = useState<"file" | "url">("file");
  const [videoUrl, setVideoUrl] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Whether URL import is accepted on this instance (GET /instance features).
  // null = unknown/not-yet-loaded → the form stays enabled (fail open); false →
  // the URL tab renders the honest disabled state instead of a dead form.
  const [importsEnabled, setImportsEnabled] = useState<boolean | null>(null);
  // The in-flight URL-import job, refreshed on every poll tick so the stage rail
  // (queued → fetching metadata → downloading → scanning & processing) tracks the
  // backend's `import_job.stage`. Cleared between attempts.
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  // The videoId+url of the last failed import, so Retry can re-enqueue against
  // the same draft (the draft survives a failed import) via the same endpoint.
  const [retryCtx, setRetryCtx] = useState<{ videoId: string; url: string } | null>(null);
  // Guards the one-shot metadata prefill so it fires once per import, right after
  // the resolving stage, and never clobbers a field the user has since edited.
  const prefillDoneRef = useRef(false);
  // Chunk-accurate progress percent (0–100) for the in-flight file upload.
  const [progress, setProgress] = useState(0);
  // Bytes transferred so far / total, for the "X of Y" detail under the bar
  // (real loaded/total from the resumable-upload progress callback).
  const [bytes, setBytes] = useState<{ loaded: number; total: number } | null>(null);
  // The picked file's name, shown in the dropzone once a file is chosen.
  const [fileName, setFileName] = useState<string | null>(null);
  // A resumable session found for the currently-picked file (matched by
  // filename + size in localStorage) — offers "Resume upload" after a refresh.
  const [resumeCandidate, setResumeCandidate] = useState<StoredUploadSession | null>(null);
  // When the creator picks more than one file at once, the single-file form gives
  // way to the batch upload queue (UPLOAD-10). null = single-file mode.
  const [batchFiles, setBatchFiles] = useState<File[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  // The in-flight chunked-upload session id, captured as soon as it opens so a
  // Cancel can DELETE the session (dropping its chunk blobs) before cleanup.
  const sessionIdRef = useRef<string | null>(null);

  // After a cancel the in-flight controls (progress + Cancel) disappear — put
  // focus back on the Publish button so keyboard users are not dropped on body.
  useEffect(() => {
    if (state === "cancelled") publishRef.current?.focus();
  }, [state]);

  // Read the instance's effective feature toggles so the "Import from URL" tab
  // reflects whether imports are accepted here (lock-step with the backend's
  // enforcement). A failed/blocked fetch leaves it null → the form stays enabled
  // and a stray 503 at submit is the defensive fallback.
  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((res) => setImportsEnabled(res.features.imports))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Cancel the in-flight upload: aborts the chunk transfer (the upload promise
  // rejects as a cancellation, handled in the catch blocks below).
  function cancelUpload() {
    abortRef.current?.abort();
  }

  // finishWithVideo applies the state-based outcome: a returned video may be
  // state="failed" (a probe/scan rejected it after the HTTP call succeeded) —
  // that is an honest error, never "Published!". A published/scheduled/
  // quarantined/processing result clears the form.
  function finishWithVideo(video: Video, from: "file" | "url") {
    if (video.state === "failed") {
      setError(failedStateError(from));
      setState("error");
      return;
    }
    setResult(video);
    setState("done");
    setTitle("");
    setDescription("");
    setCategory("");
    setLanguage("");
    setLicense("");
    setTags([]);
    setPublishAt("");
    setVideoUrl("");
    setResumeCandidate(null);
    setFileName(null);
    setBytes(null);
    setImportJob(null);
    setRetryCtx(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // applyFieldErrors maps a 422's field errors inline onto the matching form
  // fields (aria-invalid + aria-describedby); returns true when it handled them.
  function applyFieldErrors(err: unknown): boolean {
    if (err instanceof ApiError && err.status === 422 && err.fields && err.fields.length > 0) {
      const map: Record<string, string> = {};
      for (const f of err.fields) {
        if (PUBLISH_FIELDS.has(f.field)) map[f.field] = f.message;
      }
      if (Object.keys(map).length > 0) {
        setFieldErrors(map);
        setState("error");
        return true;
      }
    }
    return false;
  }

  // discardSession abandons a lingering resumable session: DELETE the session
  // (drops its chunks) and best-effort delete its draft video.
  async function discardSession(s: StoredUploadSession) {
    await api.cancelUploadSession(s.uploadId).catch(() => {});
    forgetUploadSession(s.uploadId);
    void api.deleteVideo(s.videoId).catch(() => {});
  }

  // importAndPoll enqueues the async URL import (202, always resolver "auto" — the
  // UI never guesses direct vs platform) then polls the job until it is done or
  // failed, calling onJob after each response so the caller can drive the stage
  // rail + metadata prefill. On done it reads the finalised video; on failed it
  // returns the surfaced, safe error message.
  async function importAndPoll(
    videoId: string,
    url: string,
    signal: AbortSignal,
    onJob: (job: ImportJob) => void,
  ): Promise<{ ok: true; video: Video } | { ok: false; error: string }> {
    let job = (await api.importVideoFile(videoId, url, "auto")).import_job;
    onJob(job);
    while (job.state === "pending" || job.state === "running") {
      await sleep(IMPORT_POLL_INTERVAL_MS, signal);
      job = (await api.getVideoImport(videoId, signal)).import_job;
      onJob(job);
    }
    if (job.state === "failed") {
      return {
        ok: false,
        error: job.error && job.error.trim() !== "" ? job.error : failedStateError("url"),
      };
    }
    const video = await api.getVideo(videoId, undefined, signal);
    return { ok: true, video };
  }

  // maybePrefill fires once per import, right after the resolving stage, refetching
  // the draft so any yt-dlp-resolved title/description the worker applied to it
  // shows in the form. User edits win: a field the creator has already typed into
  // is never overwritten (only an empty field is filled). Poster is intentionally
  // not shown — the backend derives it from the downloaded original during
  // processing, not from the resolver.
  function maybePrefill(videoId: string, job: ImportJob, signal: AbortSignal) {
    if (prefillDoneRef.current || !importResolved(job)) return;
    prefillDoneRef.current = true;
    void api
      .getVideo(videoId, undefined, signal)
      .then((v) => {
        setTitle((t) => (t.trim() === "" ? v.title : t));
        setDescription((d) => (d.trim() === "" ? v.description : d));
      })
      .catch(() => {});
  }

  // runImport enqueues + polls an import for an EXISTING draft video, driving the
  // stage rail, the one-shot metadata prefill, and the honest terminal outcome.
  // Shared by the initial URL publish and the Retry affordance (both target the
  // same draft — it survives a failed import). The caller owns the AbortController
  // (and clears abortRef in its finally).
  async function runImport(videoId: string, url: string, controller: AbortController) {
    prefillDoneRef.current = false;
    setImportJob(null);
    try {
      const outcome = await importAndPoll(videoId, url, controller.signal, (job) => {
        setImportJob(job);
        maybePrefill(videoId, job, controller.signal);
      });
      if (!outcome.ok) {
        setError(outcome.error);
        setRetryCtx({ videoId, url });
        setState("error");
        return;
      }
      finishWithVideo(outcome.video, "url");
    } catch (err) {
      if (isUploadCancelled(err)) {
        setState("cancelled");
        return;
      }
      // Imports turned off after the tab rendered (or an explicitly-disabled
      // resolver): drop to the honest disabled state, never a stuck spinner.
      if (isImportsDisabledError(err)) {
        setImportsEnabled(false);
        setImportJob(null);
        setState("idle");
        return;
      }
      // A 422 with a url field error renders inline on the URL input (not a retry).
      if (applyFieldErrors(err)) return;
      setError(importOrUploadError(err, "url"));
      setRetryCtx({ videoId, url });
      setState("error");
    }
  }

  // retryImport re-enqueues the last failed import against the same draft via the
  // same endpoint (the backend returns/replaces the job for that video).
  async function retryImport() {
    const ctx = retryCtx;
    if (!ctx || state === "uploading") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("uploading");
    setError(null);
    setFieldErrors({});
    setResult(null);
    setRetryCtx(null);
    try {
      await runImport(ctx.videoId, ctx.url, controller);
    } finally {
      abortRef.current = null;
    }
  }

  // changeSource switches the upload/import tab, clearing any transient outcome
  // of the other source (a stray URL-import error must not linger on the file tab,
  // and vice versa). No-op mid-upload (the control is disabled then anyway).
  function changeSource(next: "file" | "url") {
    if (next === source || state === "uploading") return;
    setSource(next);
    setError(null);
    setFieldErrors({});
    setRetryCtx(null);
    setImportJob(null);
    if (state === "error" || state === "cancelled") setState("idle");
  }

  // onFilePicked routes the picked file(s). More than one file switches to the
  // batch upload queue (UPLOAD-10); a single file keeps the rich single-file form
  // and offers a resume when it matches an unfinished session (same filename +
  // size) left by an interrupted upload.
  function onFilePicked() {
    setError(null);
    const files = [...(fileRef.current?.files ?? [])];
    if (files.length > 1) {
      // Hand the files to the batch queue and reset the single-file input so the
      // form returns clean when the batch is cleared.
      setBatchFiles(files);
      if (fileRef.current) fileRef.current.value = "";
      setFileName(null);
      setResumeCandidate(null);
      return;
    }
    const file = files[0];
    setFileName(file ? file.name : null);
    setResumeCandidate(file ? findResumableUploadSession(file) : null);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const url = videoUrl.trim();
    if (state === "uploading" || title.trim() === "" || handle === "") return;
    if (source === "file" && !file) return;
    if (source === "url" && url === "") return;
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = null;
    setState("uploading");
    setProgress(0);
    setError(null);
    setFieldErrors({});
    setResult(null);
    setRetryCtx(null);
    let draftId: string | null = null;
    try {
      // A fresh publish for a file that still has a lingering resumable session
      // discards it first, so a new upload never leaves an orphan behind.
      if (source === "file" && file) {
        const stale = findResumableUploadSession(file);
        if (stale) await discardSession(stale);
        setResumeCandidate(null);
      }
      const scheduleIso = scheduleToIso(publishAt);
      const draft = await api.createVideoDraft(handle, {
        title: title.trim(),
        description: description.trim(),
        privacy,
        ...taxonomyFields(category, language, license),
        ...(tags.length > 0 ? { tags } : {}),
        ...(scheduleIso ? { publish_at: scheduleIso } : {}),
        ...(sensitive ? { is_sensitive: true } : {}),
      });
      draftId = draft.id;
      // Cancel clicked while the draft POST was still in flight: stop before the
      // upload starts and clean up the just-created draft.
      if (controller.signal.aborted) {
        void api.deleteVideo(draft.id).catch(() => {});
        setState("cancelled");
        return;
      }
      if (source === "url") {
        // runImport owns the URL outcome (rail, prefill, retry, disabled) and its
        // own error handling, so it never falls through to the file-upload catch.
        await runImport(draft.id, url, controller);
        return;
      }
      // File source: the resumable (chunked) protocol — create session → PUT
      // chunks sequentially (per-chunk retry) → complete.
      const res: UploadVideoResult = await resumableUpload(draft.id, file as File, {
        onProgress: (p) => {
          setProgress(p.percent);
          setBytes({ loaded: p.loaded, total: p.total });
        },
        signal: controller.signal,
        onSessionOpened: (id) => {
          sessionIdRef.current = id;
        },
      });
      finishWithVideo(res.video, "file");
    } catch (err) {
      // A local cancellation is not an error: DELETE the session (dropping its
      // chunk blobs) and the orphaned draft, then return the form to editable.
      if (isUploadCancelled(err)) {
        if (sessionIdRef.current) {
          void api.cancelUploadSession(sessionIdRef.current).catch(() => {});
          forgetUploadSession(sessionIdRef.current);
        }
        if (draftId) void api.deleteVideo(draftId).catch(() => {});
        setState("cancelled");
        return;
      }
      if (applyFieldErrors(err)) return;
      setError(importOrUploadError(err, source));
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }

  // resumeUpload continues an interrupted upload for the re-picked file: read the
  // session's received chunks, then PUT only the missing ones and complete. The
  // draft already carries the original metadata, so nothing is re-created.
  async function resumeUpload() {
    const file = fileRef.current?.files?.[0];
    const cand = resumeCandidate;
    if (!cand || !file || state === "uploading") return;
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = cand.uploadId;
    setState("uploading");
    setProgress(0);
    setError(null);
    setFieldErrors({});
    setResult(null);
    try {
      const status = await api.getUploadSession(cand.uploadId, controller.signal);
      if (status.state !== "active") {
        forgetUploadSession(cand.uploadId);
        setResumeCandidate(null);
        setError("That unfinished upload is no longer available — publish to start a new one.");
        setState("error");
        return;
      }
      const res = await resumableUpload(status.video_id, file, {
        resume: status,
        onProgress: (p) => {
          setProgress(p.percent);
          setBytes({ loaded: p.loaded, total: p.total });
        },
        signal: controller.signal,
        onSessionOpened: (id) => {
          sessionIdRef.current = id;
        },
      });
      finishWithVideo(res.video, "file");
    } catch (err) {
      if (isUploadCancelled(err)) {
        if (sessionIdRef.current) {
          void api.cancelUploadSession(sessionIdRef.current).catch(() => {});
          forgetUploadSession(sessionIdRef.current);
        }
        void api.deleteVideo(cand.videoId).catch(() => {});
        setResumeCandidate(null);
        setState("cancelled");
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        forgetUploadSession(cand.uploadId);
        setResumeCandidate(null);
        setError("That unfinished upload is no longer available — publish to start a new one.");
        setState("error");
        return;
      }
      setError(importOrUploadError(err, "file"));
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-bold tracking-tight">Upload a video</h2>
      {batchFiles ? (
        <BatchUploadQueue
          initialFiles={batchFiles}
          channels={channels}
          defaultHandle={handle}
          defaultPrivacy={privacy}
          onUploaded={onUploaded}
          onClearBatch={() => setBatchFiles(null)}
        />
      ) : (
        <>
      <form
        onSubmit={(e) => void upload(e)}
        className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5"
      >
        {channels.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-fg">Channel</span>
            <span className="relative">
              <select
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                aria-label="Channel"
                className={SELECT_FIELD}
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.handle}>
                    {ch.display_name} (@{ch.handle})
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
              />
            </span>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My video"
            aria-label="Video title"
            maxLength={200}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? "publish-title-error" : undefined}
            className={FIELD}
          />
          <FieldErrorText id="publish-title-error" message={fieldErrors.title} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell viewers about your video (optional)"
            aria-label="Video description"
            rows={3}
            maxLength={5000}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? "publish-description-error" : undefined}
            className={`resize-y ${FIELD}`}
          />
          <FieldErrorText id="publish-description-error" message={fieldErrors.description} />
        </label>
        <TaxonomySelect
          label="Category"
          ariaLabel="Video category"
          value={category}
          onChange={setCategory}
          options={config?.categories ?? []}
          error={fieldErrors.category}
          errorId="publish-category-error"
        />
        <TaxonomySelect
          label="Language"
          ariaLabel="Video language"
          value={language}
          onChange={setLanguage}
          options={config?.languages ?? []}
          error={fieldErrors.language}
          errorId="publish-language-error"
        />
        <TaxonomySelect
          label="License"
          ariaLabel="Video license"
          value={license}
          onChange={setLicense}
          options={config?.licenses ?? []}
          error={fieldErrors.license}
          errorId="publish-license-error"
        />
        <TagsInput value={tags} onChange={setTags} ariaLabel="Video tags" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg">Privacy</span>
          <span className="relative">
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
              aria-label="Privacy"
              aria-invalid={fieldErrors.privacy ? true : undefined}
              aria-describedby={fieldErrors.privacy ? "publish-privacy-error" : undefined}
              className={SELECT_FIELD}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <ChevronDownIcon
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
            />
          </span>
          <FieldErrorText id="publish-privacy-error" message={fieldErrors.privacy} />
        </label>
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="min-w-0">
            <span className="block font-medium text-fg">Contains sensitive content</span>
            <span className="block text-xs text-fg-muted">
              Some instances hide, blur, or warn before playing sensitive videos.
            </span>
          </div>
          <Toggle
            checked={sensitive}
            onChange={setSensitive}
            label="Contains sensitive content"
            disabled={state === "uploading"}
          />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg">Schedule publish (optional)</span>
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-label="Schedule publish"
            aria-invalid={fieldErrors.publish_at ? true : undefined}
            aria-describedby={fieldErrors.publish_at ? "publish-schedule-error" : undefined}
            className={FIELD}
          />
          <FieldErrorText id="publish-schedule-error" message={fieldErrors.publish_at} />
          <span className="text-xs text-fg-muted">
            Leave empty to publish as soon as processing finishes. A scheduled video stays
            hidden from public surfaces until this time (must be in the future).
          </span>
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span id="video-source-label" className="font-medium text-fg">
            Source
          </span>
          <SegmentedControl
            value={source}
            onChange={changeSource}
            labelledBy="video-source-label"
            disabled={state === "uploading"}
            fullWidth
            options={[
              { value: "file", label: "Upload file" },
              { value: "url", label: "Import from URL" },
            ]}
          />
        </div>
        {source === "file" ? (
          // Design's dashed dropzone: the file input is a full-bleed transparent
          // overlay (still labelled "Video file" for pickers + tests + keyboard),
          // with the visual chrome painted underneath and a keyboard focus ring
          // driven off `peer-focus-visible`.
          <div className="flex flex-col gap-2 text-sm">
            <span className="font-medium text-fg">Video file</span>
            <div className="relative">
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                multiple
                aria-label="Video file"
                onChange={onFilePicked}
                className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              />
              <div className="pointer-events-none flex flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-border px-6 py-9 text-center transition-colors peer-hover:border-fg-muted peer-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)]">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
                  <UploadIcon size={24} className="text-fg" />
                </span>
                <span className="max-w-full truncate text-[15px] font-semibold text-fg">
                  {fileName ?? "Choose a video"}
                </span>
                <span className="text-[13px] leading-relaxed text-fg-muted">
                  MP4, MOV, WebM, MKV · up to 8 GB
                  <br />
                  Resumable — leave and come back · pick several to upload a batch
                </span>
              </div>
            </div>
            <span className="text-center text-xs text-fg-muted">
              New uploads are scanned and may be held briefly for review.
            </span>
          </div>
        ) : importsEnabled === false ? (
          // Imports are turned off on this instance — an honest empty state, never
          // a dead form the creator can submit into a 503.
          <EmptyState
            title="Imports are disabled on this instance"
            message="The operator has turned off URL video import here. Upload a file instead, or check back later."
          />
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-fg">Video URL</span>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onPaste={(e) => {
                // Paste-detect: a pasted http(s) URL is trimmed of the stray
                // whitespace/newlines that ride along when copying a link.
                const text = e.clipboardData.getData("text").trim();
                if (text !== "" && /^https?:\/\//i.test(text)) {
                  e.preventDefault();
                  setVideoUrl(text);
                }
              }}
              type="url"
              placeholder="https://example.com/clip.mp4"
              aria-label="Video URL"
              aria-invalid={fieldErrors.url ? true : undefined}
              aria-describedby={fieldErrors.url ? "publish-url-error" : undefined}
              className={FIELD}
            />
            <FieldErrorText id="publish-url-error" message={fieldErrors.url} />
            <span className="text-xs text-fg-muted">
              A public link to a video file or a supported platform watch page. We fetch, scan,
              and publish it.
            </span>
          </label>
        )}
        {source === "url" && state === "uploading" ? (
          <ImportStageRail job={importJob} />
        ) : null}
        {source === "file" && resumeCandidate && state !== "uploading" ? (
          // A resumable session was left by an interrupted upload of this exact
          // file — offer to resume from the chunks that already landed.
          <div
            role="status"
            className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4 text-sm"
          >
            <p className="text-fg">
              Unfinished upload found for “{resumeCandidate.filename}”. Resume where you left off,
              or start a new upload.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void resumeUpload()}>
                Resume upload
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void discardSession(resumeCandidate);
                  setResumeCandidate(null);
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            ref={publishRef}
            type="submit"
            disabled={state === "uploading" || (source === "url" && importsEnabled === false)}
            className={buttonClasses("primary", "md")}
          >
            {state === "uploading" ? (source === "url" ? "Importing…" : "Uploading…") : "Publish"}
          </button>
          {state === "uploading" && source === "file" ? (
            // Determinate byte-level progress for the in-flight file upload
            // (the URL import has no local bytes to measure) + a Cancel that
            // aborts the transfer and cleans up the orphaned draft.
            <>
              <div
                role="progressbar"
                aria-label="Upload progress"
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
              <span
                aria-hidden="true"
                className="text-xs font-semibold tabular-nums text-fg-muted"
              >
                {progress}%
              </span>
              <Button variant="secondary" aria-label="Cancel upload" onClick={cancelUpload}>
                Cancel
              </Button>
            </>
          ) : null}
        </div>
        {state === "uploading" && source === "file" && bytes ? (
          // Real byte-level detail (loaded/total from the resumable-upload
          // progress callback) — the design's "X of Y" chunk line, peer-free.
          <p className="text-[12.5px] tabular-nums text-fg-muted">
            {formatBytes(bytes.loaded)} of {formatBytes(bytes.total)} · resumes from the last
            completed chunk if interrupted
          </p>
        ) : null}
      </form>
      {state === "done" && result ? (
        result.state === "published" ? (
          <p role="status" className="text-sm text-success">
            Published!{" "}
            <Link href={`/videos/${result.id}`} className="font-semibold underline">
              View “{result.title}”
            </Link>
          </p>
        ) : result.state === "scheduled" ? (
          // Honest scheduled outcome: processed and parked until publish_at.
          <p role="status" className="text-sm text-fg-muted">
            “{result.title}” is scheduled — it will publish automatically
            {result.publish_at ? ` on ${formatDateTime(result.publish_at)}` : " at the scheduled time"}.
          </p>
        ) : result.state === "quarantined" ? (
          // Quarantine is its own outcome, not a failure: the upload succeeded
          // but this instance holds new uploads for moderator review.
          <p role="status" className="text-sm text-warning">
            “{result.title}” was received and is held for review — this instance reviews new
            uploads before they go public. It will publish once a moderator approves it.
          </p>
        ) : (
          // An honest in-progress message: the file was received but the backend
          // has not finished processing it — it is not watchable yet.
          <p role="status" className="text-sm text-warning">
            “{result.title}” was received and is still processing — it will appear in Your videos
            once it’s ready.
          </p>
        )
      ) : null}
      {state === "cancelled" ? (
        <p role="status" className="text-sm text-fg-muted">
          Upload cancelled — nothing was published. Your details are kept so you can try again.
        </p>
      ) : null}
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          {retryCtx ? (
            // A failed URL import keeps its draft, so Retry re-enqueues against the
            // same video via the same endpoint — no re-entry of the form.
            <Button variant="secondary" size="sm" onClick={() => void retryImport()}>
              Retry import
            </Button>
          ) : null}
        </div>
      ) : null}
        </>
      )}
    </section>
  );
}

// ImportStageRail renders the URL-import progress rail (UPLOAD-09): the four
// coarse stages the backend reports on `import_job` (queued → fetching metadata →
// downloading → scanning & processing). The active stage spins, completed stages
// check off, and later stages sit muted — the same spinner + pill vocabulary the
// studio uses elsewhere. `job` is null for the brief window before the enqueue
// POST returns; the rail then reads as "Queued".
function ImportStageRail({ job }: { job: ImportJob | null }) {
  const active = job ? importActiveStage(job) : 0;
  return (
    <ol
      aria-label="Import progress"
      className="flex flex-col gap-2 rounded-2xl bg-surface-muted p-4"
    >
      {IMPORT_STAGES.map((stage, i) => {
        const done = active < 0 || i < active;
        const current = i === active;
        return (
          <li
            key={stage.key}
            aria-current={current ? "step" : undefined}
            className="flex items-center gap-2.5 text-sm"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                done
                  ? "bg-success/15 text-success"
                  : current
                    ? "text-accent"
                    : "bg-surface-strong text-fg-muted"
              }`}
            >
              {done ? (
                <CheckIcon size={13} aria-hidden="true" />
              ) : current ? (
                <LoaderIcon size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" aria-hidden="true" />
              )}
            </span>
            <span className={current ? "font-semibold text-fg" : "text-fg-muted"}>
              {stage.label}
            </span>
            {current ? <span className="sr-only">— in progress</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

// MyVideosSection lists the owner's videos for the selected channel (the owner
// view returns drafts/private too) and lets them edit metadata or delete a video.
// It refetches on a remount/channel change; after an edit/delete the local list
// is updated from the server result.
function MyVideosSection({
  channels,
  config,
}: {
  channels: Channel[];
  config: VideoConfigResponse | null;
}) {
  const [handle, setHandle] = useState(channels[0]?.handle ?? "");
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<Video[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (handle === "") return;
    const controller = new AbortController();
    api
      .listChannelVideos(handle, undefined, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [handle, reloadKey]);

  function refetch() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Your videos</h2>
        <Button variant="secondary" size="sm" onClick={refetch}>
          Refresh
        </Button>
      </div>

      {channels.length > 1 ? (
        <Select
          label="Channel"
          value={handle}
          onChange={(e) => {
            setStatus("loading");
            setHandle(e.target.value);
          }}
          aria-label="Videos channel"
        >
          {channels.map((ch) => (
            <option key={ch.id} value={ch.handle}>
              {ch.display_name} (@{ch.handle})
            </option>
          ))}
        </Select>
      ) : null}

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load your videos." onRetry={refetch} />
      ) : videos.length === 0 ? (
        <p className="text-sm text-fg-muted">No videos in this channel yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              config={config}
              onUpdated={(u) => setVideos((list) => list.map((x) => (x.id === u.id ? u : x)))}
              onDeleted={() => setVideos((list) => list.filter((x) => x.id !== v.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type RowMode = "view" | "edit" | "confirm-delete";

// VideoRow shows one of the owner's videos with inline edit (title + privacy) and
// a two-step delete confirmation. The server result is the source of truth.
function VideoRow({
  video,
  config,
  onUpdated,
  onDeleted,
}: {
  video: Video;
  config: VideoConfigResponse | null;
  onUpdated: (v: Video) => void;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<RowMode>("view");
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
  const [detail, setDetail] = useState<Video | null>(null);

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
      canSchedule && scheduleIso !== undefined && publishAt !== toLocalInputValue(editable.publish_at);
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
        // the real current value (list rows omit it).
        ...(detail ? { is_sensitive: sensitive } : {}),
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
          <option value="password">Password-protected</option>
        </Select>
        {/* Password management (CORE-17) appears when privacy is password; it
            reports its count up so the Save guard can block an empty set. */}
        {privacy === "password" ? (
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
          <Link href={`/videos/${video.id}`} className="hover:underline">
            {video.title}
          </Link>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <StateBadge state={video.state ?? "draft"} />
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
            Held for review — this instance reviews new uploads before they go public. Only you
            and the moderators can see it until it is approved.
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
      <p className="text-xs text-fg-muted">
        Streaming (HLS) ready{heights ? `: ${heights}` : ""}.
      </p>
    );
  }
  return (
    <p className="text-xs text-fg-muted">
      HD streaming versions are not ready — viewers currently watch the original file. They
      appear automatically once transcoding completes (if enabled on this instance).
    </p>
  );
}

function StateBadge({ state }: { state: VideoState }) {
  const styles: Record<VideoState, string> = {
    draft: "bg-surface-strong text-fg-muted",
    processing: "bg-warning/15 text-warning",
    scheduled: "bg-surface-strong text-fg-muted",
    quarantined: "bg-warning/15 text-warning",
    published: "bg-success/15 text-success",
    failed: "bg-danger-surface text-danger",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${styles[state]}`}
    >
      {state}
    </span>
  );
}
