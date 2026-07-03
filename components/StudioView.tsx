"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CaptionsManager } from "@/components/CaptionsManager";
import { LiveStreamsSection } from "@/components/LiveStreamsSection";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { ProfileImageManager } from "@/components/ProfileImageManager";
import { TagsInput } from "@/components/TagsInput";
import { ThumbnailManager } from "@/components/ThumbnailManager";
import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import {
  ApiError,
  api,
  channelAvatarUrl,
  channelBannerUrl,
  findResumableUploadSession,
  forgetUploadSession,
  isUploadCancelled,
  resumableUpload,
} from "@/lib/api";
import type {
  Channel,
  StoredUploadSession,
  UploadVideoResult,
  Video,
  VideoConfigOption,
  VideoConfigResponse,
  VideoPrivacy,
  VideoState,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

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
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
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
      <ChannelSection
        channels={channels}
        onCreated={(ch) => setChannels((list) => [ch, ...list])}
        onUpdated={(ch) => setChannels((list) => list.map((c) => (c.id === ch.id ? ch : c)))}
        onDeleted={(id) => setChannels((list) => list.filter((c) => c.id !== id))}
      />
      {channels.length > 0 ? (
        <UploadSection key={`upload-${channelsKey}`} channels={channels} config={config} />
      ) : null}
      {channels.length > 0 ? (
        <MyVideosSection key={`videos-${channelsKey}`} channels={channels} config={config} />
      ) : null}
      {channels.length > 0 ? (
        <LiveStreamsSection key={`live-${channelsKey}`} channels={channels} />
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
        err instanceof ApiError && err.status === 409
          ? "That handle is already taken."
          : "Could not create the channel.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Your channels</h2>
      {channels.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Create your first channel to start publishing.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {channels.map((ch) => (
            <ChannelRow key={ch.id} channel={ch} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-end dark:border-zinc-800"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Handle</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="ada_makes"
            aria-label="Channel handle"
            minLength={3}
            maxLength={30}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ada Makes"
            aria-label="Channel display name"
            maxLength={50}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          disabled={busy || handle.trim() === "" || displayName.trim() === ""}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create channel
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
      setError(err instanceof ApiError ? err.message : "Could not save the channel.");
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
      setError(err instanceof ApiError ? err.message : "Could not delete the channel.");
      setBusy(false);
      setMode("view");
    }
  }

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 px-4 py-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label="Edit channel name"
            maxLength={50}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Edit channel description"
            rows={3}
            maxLength={1000}
            className="resize-y rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
          <button
            type="button"
            disabled={busy || displayName.trim() === ""}
            onClick={() => void save()}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={cancelEdit}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <Link href={`/channels/${channel.handle}`} className="hover:underline">
            {channel.display_name}
          </Link>
        </p>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">@{channel.handle}</span>
      </div>
      {mode === "confirm-delete" ? (
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Delete channel?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="font-medium text-red-600 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:text-red-400"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("view")}
            className="font-medium text-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <button
            type="button"
            aria-label={`Edit ${channel.handle}`}
            onClick={() => setMode("edit")}
            className="font-medium text-zinc-600 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete ${channel.handle}`}
            onClick={() => setMode("confirm-delete")}
            className="font-medium text-zinc-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-red-400"
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
    <p id={id} className="text-xs text-red-600 dark:text-red-400">
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
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && errorId ? errorId : undefined}
        className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
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
    if (source === "url" && err.status === 422) {
      return "Couldn't fetch that URL — it must be a public link to a video file.";
    }
  }
  return source === "url" ? "Import failed. Please try again." : "Upload failed. Please try again.";
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

function UploadSection({ channels, config }: { channels: Channel[]; config: VideoConfigResponse | null }) {
  const [handle, setHandle] = useState(channels[0]?.handle ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [license, setLicense] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<VideoPrivacy>("public");
  const [publishAt, setPublishAt] = useState("");
  const [source, setSource] = useState<"file" | "url">("file");
  const [videoUrl, setVideoUrl] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Chunk-accurate progress percent (0–100) for the in-flight file upload.
  const [progress, setProgress] = useState(0);
  // A resumable session found for the currently-picked file (matched by
  // filename + size in localStorage) — offers "Resume upload" after a refresh.
  const [resumeCandidate, setResumeCandidate] = useState<StoredUploadSession | null>(null);
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

  // importAndPoll enqueues the async URL import (202) then polls the job until it
  // is done or failed. On done it reads the finalised video; on failed it returns
  // the surfaced, safe error message.
  async function importAndPoll(
    videoId: string,
    url: string,
    signal: AbortSignal,
  ): Promise<{ ok: true; video: Video } | { ok: false; error: string }> {
    let job = (await api.importVideoFile(videoId, url)).import_job;
    while (job.state === "pending" || job.state === "running") {
      await sleep(IMPORT_POLL_INTERVAL_MS, signal);
      job = (await api.getVideoImport(videoId, signal)).import_job;
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

  // onFilePicked offers a resume when the re-picked file matches an unfinished
  // session (same filename + size) left by an interrupted upload.
  function onFilePicked() {
    setError(null);
    const file = fileRef.current?.files?.[0];
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
        const imported = await importAndPoll(draft.id, url, controller.signal);
        if (!imported.ok) {
          setError(imported.error);
          setState("error");
          return;
        }
        finishWithVideo(imported.video, "url");
        return;
      }
      // File source: the resumable (chunked) protocol — create session → PUT
      // chunks sequentially (per-chunk retry) → complete.
      const res: UploadVideoResult = await resumableUpload(draft.id, file as File, {
        onProgress: (p) => setProgress(p.percent),
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
        onProgress: (p) => setProgress(p.percent),
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
      <h2 className="text-lg font-semibold">Upload a video</h2>
      <form
        onSubmit={(e) => void upload(e)}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        {channels.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Channel</span>
            <select
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-label="Channel"
              className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.handle}>
                  {ch.display_name} (@{ch.handle})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My video"
            aria-label="Video title"
            maxLength={200}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? "publish-title-error" : undefined}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <FieldErrorText id="publish-title-error" message={fieldErrors.title} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell viewers about your video (optional)"
            aria-label="Video description"
            rows={3}
            maxLength={5000}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? "publish-description-error" : undefined}
            className="resize-y rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
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
          <span className="font-medium">Privacy</span>
          <select
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
            aria-label="Privacy"
            aria-invalid={fieldErrors.privacy ? true : undefined}
            aria-describedby={fieldErrors.privacy ? "publish-privacy-error" : undefined}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
          <FieldErrorText id="publish-privacy-error" message={fieldErrors.privacy} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Schedule publish (optional)</span>
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-label="Schedule publish"
            aria-invalid={fieldErrors.publish_at ? true : undefined}
            aria-describedby={fieldErrors.publish_at ? "publish-schedule-error" : undefined}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <FieldErrorText id="publish-schedule-error" message={fieldErrors.publish_at} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Leave empty to publish as soon as processing finishes. A scheduled video stays
            hidden from public surfaces until this time (must be in the future).
          </span>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Source</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="video-source"
                checked={source === "file"}
                onChange={() => setSource("file")}
              />
              Upload file
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="video-source"
                checked={source === "url"}
                onChange={() => setSource("url")}
              />
              Import from URL
            </label>
          </div>
        </fieldset>
        {source === "file" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Video file</span>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              aria-label="Video file"
              onChange={onFilePicked}
              className="text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-zinc-800"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Large files upload in chunks and can be resumed if interrupted.
            </span>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Video URL</span>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              type="url"
              placeholder="https://example.com/clip.mp4"
              aria-label="Video URL"
              aria-invalid={fieldErrors.url ? true : undefined}
              aria-describedby={fieldErrors.url ? "publish-url-error" : undefined}
              className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <FieldErrorText id="publish-url-error" message={fieldErrors.url} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              A public direct link to a video file. We fetch and publish it.
            </span>
          </label>
        )}
        {source === "file" && resumeCandidate && state !== "uploading" ? (
          // A resumable session was left by an interrupted upload of this exact
          // file — offer to resume from the chunks that already landed.
          <div
            role="status"
            className="flex flex-col gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm dark:border-sky-800 dark:bg-sky-950/40"
          >
            <p className="text-sky-800 dark:text-sky-200">
              Unfinished upload found for “{resumeCandidate.filename}”. Resume where you left off,
              or start a new upload.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void resumeUpload()}
                className="rounded-full bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                Resume upload
              </button>
              <button
                type="button"
                onClick={() => {
                  void discardSession(resumeCandidate);
                  setResumeCandidate(null);
                }}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            ref={publishRef}
            type="submit"
            disabled={state === "uploading"}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
                className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              >
                <div
                  className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 dark:bg-zinc-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span
                aria-hidden="true"
                className="text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-300"
              >
                {progress}%
              </span>
              <button
                type="button"
                aria-label="Cancel upload"
                onClick={cancelUpload}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </form>
      {state === "done" && result ? (
        result.state === "published" ? (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Published!{" "}
            <Link href={`/videos/${result.id}`} className="font-medium underline">
              View “{result.title}”
            </Link>
          </p>
        ) : result.state === "scheduled" ? (
          // Honest scheduled outcome: processed and parked until publish_at.
          <p role="status" className="text-sm text-sky-700 dark:text-sky-300">
            “{result.title}” is scheduled — it will publish automatically
            {result.publish_at ? ` on ${formatDateTime(result.publish_at)}` : " at the scheduled time"}.
          </p>
        ) : result.state === "quarantined" ? (
          // Quarantine is its own outcome, not a failure: the upload succeeded
          // but this instance holds new uploads for moderator review.
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            “{result.title}” was received and is held for review — this instance reviews new
            uploads before they go public. It will publish once a moderator approves it.
          </p>
        ) : (
          // An honest in-progress message: the file was received but the backend
          // has not finished processing it — it is not watchable yet.
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            “{result.title}” was received and is still processing — it will appear in Your videos
            once it’s ready.
          </p>
        )
      ) : null}
      {state === "cancelled" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          Upload cancelled — nothing was published. Your details are kept so you can try again.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
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
        <h2 className="text-lg font-semibold">Your videos</h2>
        <button
          type="button"
          onClick={refetch}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {channels.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Channel</span>
          <select
            value={handle}
            onChange={(e) => {
              setStatus("loading");
              setHandle(e.target.value);
            }}
            aria-label="Videos channel"
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.handle}>
                {ch.display_name} (@{ch.handle})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load your videos." onRetry={refetch} />
      ) : videos.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No videos in this channel yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
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
  const [privacy, setPrivacy] = useState<VideoPrivacy>(video.privacy);
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
        ...(scheduleChanged ? { publish_at: scheduleIso } : {}),
      });
      onUpdated(updated);
      setMode("view");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the video.");
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
    setPrivacy(video.privacy);
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
      setPrivacy(full.privacy);
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
      <li className="flex flex-col gap-2 px-4 py-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Edit title"
            maxLength={200}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Edit description"
            rows={3}
            maxLength={5000}
            className="resize-y rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Privacy</span>
          <select
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
            aria-label="Edit privacy"
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
        {canSchedule ? (
          // Scheduling is only editable while the video has not published yet —
          // the backend rejects publish_at on a published video, and a schedule
          // cannot be cleared through the contract (only moved).
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Scheduled publish</span>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              aria-label="Edit scheduled publish"
              className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Set or move the automatic publish time (must be in the future).
            </span>
          </label>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {detail ? <StreamingStatus video={detail} /> : null}
        <ThumbnailManager videoId={video.id} hasThumbnail={video.has_thumbnail ?? false} />
        <CaptionsManager videoId={video.id} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || title.trim() === ""}
            onClick={() => void save()}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={cancelEdit}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <Link href={`/videos/${video.id}`} className="hover:underline">
            {video.title}
          </Link>
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <StateBadge state={video.state} />
          {video.privacy === "public" ? (
            <span className="text-zinc-500 dark:text-zinc-400">Public</span>
          ) : (
            <PrivacyBadge privacy={video.privacy} />
          )}
          {video.state === "scheduled" && video.publish_at ? (
            <span className="text-zinc-500 dark:text-zinc-400">
              publishes {formatDateTime(video.publish_at)}
            </span>
          ) : null}
        </div>
        {video.state === "quarantined" ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Held for review — this instance reviews new uploads before they go public. Only you
            and the moderators can see it until it is approved.
          </p>
        ) : null}
      </div>
      {mode === "confirm-delete" ? (
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Delete?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="font-medium text-red-600 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:text-red-400"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("view")}
            className="font-medium text-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => void startEdit()}
            className="font-medium text-zinc-600 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm-delete")}
            className="font-medium text-zinc-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-red-400"
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
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Streaming (HLS) ready{heights ? `: ${heights}` : ""}.
      </p>
    );
  }
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      HD streaming versions are not ready — viewers currently watch the original file. They
      appear automatically once transcoding completes (if enabled on this instance).
    </p>
  );
}

function StateBadge({ state }: { state: VideoState }) {
  const styles: Record<VideoState, string> = {
    draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    processing: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    quarantined: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${styles[state]}`}>{state}</span>
  );
}
