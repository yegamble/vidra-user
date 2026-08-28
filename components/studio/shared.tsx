"use client";

import { ChevronDownIcon } from "@/components/icons";
import { ApiError, api, errorMessage, forgetUploadSession } from "@/lib/api";
import type { StoredUploadSession, VideoConfigOption, VideoState } from "@/lib/api";

// Shared studio building blocks — the constants, types, small field components,
// and pure helpers that the split studio surfaces (UploadSection, VideoRow,
// MyVideosSection, ManagedVideoView, ChannelManage) all draw on. Extracted
// verbatim from the pre-split StudioView so behaviour is unchanged.

// The studio's five surfaces import `Status` from here; it is the shared
// loading/error/ready triple under a different name, re-exported rather than
// re-declared so there is one definition in the codebase, not two.
export type { ResourceStatus as Status } from "@/lib/use-api-resource";
// Upload lifecycle. "uploaded" is the file-path-only phase between a finished
// (auto-started) chunk upload and the creator pressing Publish: the bytes are on
// the server as a PRIVATE draft, the metadata form is still editable, and no
// public outcome has been produced yet.
export type UploadState = "idle" | "uploading" | "uploaded" | "done" | "cancelled" | "error";
export type RowMode = "view" | "edit" | "confirm-delete";

// Token recipes for the hand-written form fields in the upload/video forms (they
// keep bespoke markup for their per-field 422 wiring; these mirror the ui
// primitives' styling so both render identically).
export const FIELD =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";
export const SELECT_FIELD =
  "w-full appearance-none rounded-xl border border-border bg-surface px-3.5 py-2 pr-9 text-sm text-fg focus-ring disabled:opacity-60";
// Quiet pill treatment for inline row actions (Edit / Delete / Confirm / Cancel).
export const ROW_ACTION =
  "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus-ring disabled:opacity-50";

// How often the async URL-import job is polled for progress.
export const IMPORT_POLL_INTERVAL_MS = 2000;

// The publish-form fields that can carry an inline 422 message, keyed by the
// backend's field names (create-draft: title/description/privacy/taxonomy;
// import: url).
export const PUBLISH_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "description",
  "privacy",
  "category",
  "language",
  "license",
  "publish_at",
  "url",
]);

// FieldErrorText renders an inline field-level validation message (the target of
// the input's aria-describedby), matching the SignupForm pattern.
export function FieldErrorText({ id, message }: { id: string; message?: string }) {
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
export function TaxonomySelect({
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

// StateBadge renders the video lifecycle micro-status pill.
export function StateBadge({ state }: { state: VideoState }) {
  const styles: Record<VideoState, string> = {
    draft: "bg-surface-strong text-fg-muted",
    processing: "bg-warning/15 text-warning",
    scheduled: "bg-surface-strong text-fg-muted",
    quarantined: "bg-warning/15 text-warning",
    // Held by publish_after_transcode until the HLS transcode completes —
    // owner/moderator-only visibility, so an informational accent tone.
    transcoding: "bg-accent/15 text-accent",
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

// taxonomyFields builds the optional metadata part of a create/update request,
// including only the non-empty selections. Empty is omitted (not sent as ""),
// which both keeps create payloads clean and avoids the backend's 422 on an
// empty taxonomy value in a PATCH.
export function taxonomyFields(category: string, language: string, license: string) {
  const out: { category?: string; language?: string; license?: string } = {};
  if (category) out.category = category;
  if (language) out.language = language;
  if (license) out.license = license;
  return out;
}

// toLocalInputValue formats an ISO timestamp as a datetime-local input value
// (YYYY-MM-DDTHH:MM in the viewer's local zone); "" when absent/unparseable.
export function toLocalInputValue(iso?: string): string {
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
export function scheduleToIso(local: string): string | undefined {
  if (local.trim() === "") return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// importOrUploadError maps a publish failure to a friendly message, tailored to
// whether the source was a file upload or a URL import.
export function importOrUploadError(err: unknown, source: "file" | "url"): string {
  if (err instanceof ApiError) {
    if (err.status === 415) return "That is not a supported video type.";
    if (err.status === 413) return "That file is too large.";
    if (err.code === "quota_exceeded") {
      return "This upload would exceed your storage quota. Free up space or remove older videos and try again.";
    }
    if (err.code === "daily_quota_exceeded") {
      return "This upload would exceed your daily upload limit. Try again later — the limit is a rolling 24-hour window.";
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
export function failedStateError(source: "file" | "url"): string {
  return source === "url"
    ? "Processing failed — the imported file could not be published. Check that the URL points to a valid video file and try again."
    : "Processing failed — the file could not be published. Check that it is a valid video file and try again.";
}

// uploadCancelled builds the same cancellation ApiError the upload layer throws
// (status 0 + the "upload_cancelled" code), so a cancelled import poll is
// recognised by isUploadCancelled exactly like an aborted chunk upload.
export function uploadCancelled(): ApiError {
  return new ApiError({
    status: 0,
    code: "upload_cancelled",
    message: "upload cancelled",
  });
}

// sleep resolves after ms, or rejects as a cancellation when the signal aborts.
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
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

// replaceErrorMessage maps a replacement failure onto a friendly message. The
// 409 replace_conflict envelope carries a specific, client-safe reason from
// the server (mid-transcode, another replacement in flight, …) — surface it
// verbatim; the quota codes reuse the upload wording.
export function replaceErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "replace_conflict" && err.message.trim() !== "") return err.message;
    if (err.code === "feature_disabled") {
      return "Replacing video files has been turned off on this instance.";
    }
    if (err.code === "quota_exceeded") {
      return "This file would exceed your storage quota. Free up space and try again.";
    }
    if (err.code === "daily_quota_exceeded") {
      return "This file would exceed your daily upload limit. Try again later — the limit is a rolling 24-hour window.";
    }
    if (err.status === 415) {
      return "That file type is not accepted here. Pick a supported video container.";
    }
  }
  return errorMessage(err, "Could not replace the video file.");
}

// discardSession abandons a lingering resumable session: DELETE the session
// (drops its chunks) and best-effort delete its draft video.
export async function discardSession(s: StoredUploadSession) {
  await api.cancelUploadSession(s.uploadId).catch(() => {});
  forgetUploadSession(s.uploadId);
  void api.deleteVideo(s.videoId).catch(() => {});
}
