"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BatchUploadQueue } from "@/components/BatchUploadQueue";
import { TagsInput } from "@/components/TagsInput";
import { CheckIcon, ChevronDownIcon, LoaderIcon, UploadIcon, VideoIcon } from "@/components/icons";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import {
  ApiError,
  api,
  errorMessage,
  findResumableUploadSession,
  forgetUploadSession,
  isUploadCancelled,
  resumableUpload,
} from "@/lib/api";
import type {
  Channel,
  ImportJob,
  StoredUploadSession,
  UpdateVideoRequest,
  UploadPhase,
  Video,
  VideoConfigResponse,
  VideoPrivacy,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { logger } from "@/lib/logger";
import { isAcceptedVideoFile, videoAcceptAttr } from "@/lib/upload-accept";
import { titleFromFilename } from "@/lib/upload-queue";
import {
  IMPORT_STAGES,
  importActiveStage,
  importResolved,
  isImportsDisabledError,
} from "@/lib/import-status";

import {
  FIELD,
  FieldErrorText,
  IMPORT_POLL_INTERVAL_MS,
  PUBLISH_FIELDS,
  SELECT_FIELD,
  TaxonomySelect,
  type UploadState,
  discardSession,
  failedStateError,
  importOrUploadError,
  scheduleToIso,
  sleep,
  taxonomyFields,
} from "./shared";

// Exported for tests (the W9 prefill-race regression coverage renders it directly).
export function UploadSection({
  channels,
  config,
  defaultHandle,
  autoOpen = false,
  onAutoOpenConsumed,
  onUploaded,
}: {
  channels: Channel[];
  config: VideoConfigResponse | null;
  /** Studio current channel — the in-form picker starts here (falls back to channels[0]). */
  defaultHandle?: string;
  /** When true (a `?upload=1` deep link), the stepped sheet opens on mount. */
  autoOpen?: boolean;
  /** Called once after an autoOpen fires so the caller can strip the URL param. */
  onAutoOpenConsumed?: () => void;
  onUploaded?: () => void;
}) {
  const [handle, setHandle] = useState(defaultHandle ?? channels[0]?.handle ?? "");
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
  // The creator's optional content-warning text, paired with the flag above
  // (sensitive_reason, ≤280 chars, trimmed server-side). Only revealed and sent
  // while the sensitive flag is on.
  const [sensitiveReason, setSensitiveReason] = useState("");
  // Per-video publish policies (config-parity W9), prefilled from the
  // instance's defaults.publish block once GET /instance resolves.
  const [commentsPolicy, setCommentsPolicy] = useState<"enabled" | "disabled">("enabled");
  const [downloadEnabled, setDownloadEnabled] = useState(true);
  // Publish-timing opt-in (publish_after_transcode): hold the video (state
  // "transcoding") off every public surface until its HLS transcode completes.
  // Default off = current behavior (go live immediately; viewers watch the
  // original while transcoding runs). Server-side, publish_at takes precedence,
  // so the toggle disables while a schedule is set.
  const [publishAfterTranscode, setPublishAfterTranscode] = useState(false);
  // Inline error for a failed publish-timing sync PATCH (the flip reverts).
  const [publishTimingError, setPublishTimingError] = useState<string | null>(null);
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
  // Whether the extended upload container set is accepted
  // (features.upload_additional_extensions, config-parity W10) — narrows the
  // file picker's accept list in lock-step with the server's extension gate.
  // null = unknown → permissive (fail open).
  const [additionalExts, setAdditionalExts] = useState<boolean | null>(null);
  // The in-flight URL-import job, refreshed on every poll tick so the stage rail
  // (queued → fetching metadata → downloading → scanning & processing) tracks the
  // backend's `import_job.stage`. Cleared between attempts.
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  // The videoId+url of the last failed import, so Retry can re-enqueue against
  // the same draft (the draft survives a failed import) via the same endpoint.
  const [retryCtx, setRetryCtx] = useState<{
    videoId: string;
    url: string;
  } | null>(null);
  // Guards the one-shot metadata prefill so it fires once per import, right after
  // the resolving stage, and never clobbers a field the user has since edited.
  const prefillDoneRef = useRef(false);
  // Fields the creator has ALREADY touched before GET /instance resolved: the
  // defaults.publish prefill below must never clobber them (W9 review's
  // prefill-race fix). A ref, not state — reads happen inside the fetch
  // callback and must see the latest set without re-running the effect.
  const publishTouchedRef = useRef<Set<"privacy" | "license" | "comments" | "download">>(new Set());
  // Chunk-accurate progress percent (0–100) for the in-flight file upload.
  const [progress, setProgress] = useState(0);
  // Bytes transferred so far / total, for the "X of Y" detail under the bar
  // (real loaded/total from the resumable-upload progress callback).
  const [bytes, setBytes] = useState<{ loaded: number; total: number } | null>(null);
  // Which half of the upload is running. "uploading" is bytes leaving the
  // browser; "processing" is the server assembling, storing and probing the file
  // after the last chunk lands — asynchronous work with no byte counter, so the
  // card says "Processing…" instead of parking on a stalled 100% bar. It also
  // hides Cancel: once the server has accepted the completion the pipeline runs
  // regardless, and offering a button that cannot stop it would be a lie.
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("uploading");
  // The picked file's name, shown in the dropzone once a file is chosen.
  const [fileName, setFileName] = useState<string | null>(null);
  // A resumable session found for the currently-picked file (matched by
  // filename + size in localStorage) — offers "Resume upload" after a refresh.
  const [resumeCandidate, setResumeCandidate] = useState<StoredUploadSession | null>(null);
  // When the creator picks more than one file at once, the single-file form gives
  // way to the batch upload queue (UPLOAD-10). null = single-file mode.
  const [batchFiles, setBatchFiles] = useState<File[] | null>(null);
  // The picked File, captured in state so the upload survives the pick→details
  // step change (the file <input> only lives on the pick step; capturing the
  // File here means publish/resume never depend on that input staying mounted).
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  // The auto-created PRIVATE draft's id for the file path (created the instant a
  // single file is selected, before any bytes move). Publish PATCHes it; Cancel
  // deletes it. A ref shadows the state so the async upload callbacks read the
  // latest id without re-closing over a stale render.
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  // The finalised video once the auto-started chunk upload completes (file path).
  // null while bytes are still moving; drives whether Publish finishes at once or
  // parks as "publishing when the upload completes". A ref (not state) because the
  // Publish handler and the upload's completion race — both must read the LATEST
  // value, and the `state` machine ("uploading"→"uploaded") already re-renders.
  const uploadedVideoRef = useRef<Video | null>(null);
  // The creator pressed Publish while the upload was still in flight and the
  // metadata PATCH already succeeded — we are now just waiting for the bytes to
  // finish. Disables Publish (no double-submit) and shows the pending status. The
  // ref lets the upload's completion callback see the request without a re-render.
  const [publishPending, setPublishPending] = useState(false);
  const publishPendingRef = useRef(false);
  // Client-side, display-only technical metadata read from a hidden <video>
  // element (duration/resolution) plus the File's own size/type. Never sent to
  // the API — the server probes authoritatively. null until (and if) it resolves.
  const [fileMeta, setFileMeta] = useState<{
    duration: number | null;
    width: number | null;
    height: number | null;
  } | null>(null);
  // Drag-over highlight for the real drag-and-drop dropzone.
  const [dragOver, setDragOver] = useState(false);
  // Whether the creator has edited the Title, so the filename prefill never
  // clobbers a typed value (mirrors publishTouchedRef's "don't clobber" rule).
  const titleTouchedRef = useRef(false);
  // Cleanup for the in-flight client-side metadata probe (revoke the object URL).
  const metaProbeCleanupRef = useRef<(() => void) | null>(null);
  // Stepped upload sheet (design "Upload sheet"): a launched Modal staging
  // pick → details → publish, with a persistent minimized progress pill. `open`
  // drives the Modal; `step` the wizard stage; `sheet` picks the bottom-sheet
  // skin on phones (matchMedia guarded for non-browser test envs).
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [sheet] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 767px)").matches,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  // The in-flight chunked-upload session id, captured as soon as it opens so a
  // Cancel can DELETE the session (dropping its chunk blobs) before cleanup.
  const sessionIdRef = useRef<string | null>(null);
  // Guards the `?upload=1` autoOpen so it fires once per APPEARANCE of the param
  // (reset when the param is stripped), not once per mount — so re-triggering
  // "+ Create → Upload video" while already on /studio/content reopens the sheet.
  const autoOpenedRef = useRef(false);

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
      .then((res) => {
        setImportsEnabled(res.features.imports);
        setAdditionalExts(res.features.upload_additional_extensions ?? null);
        // Prefill the publish form from the operator's defaults.publish block
        // (config-parity W9). Absent fields (older backend) leave the shipped
        // form defaults; Licence 0 = "no default" keeps the empty selection.
        // The prefill only fills fields the creator has NOT touched yet — a
        // slow /instance response must never clobber an explicit choice made
        // while it was in flight (the W9 review's prefill race).
        const touched = publishTouchedRef.current;
        const publish = res.defaults?.publish;
        if (!publish) return;
        if (publish.privacy && !touched.has("privacy")) setPrivacy(publish.privacy as VideoPrivacy);
        if (publish.licence && !touched.has("license")) setLicense(String(publish.licence));
        if (
          (publish.comment_policy === "enabled" || publish.comment_policy === "disabled") &&
          !touched.has("comments")
        ) {
          setCommentsPolicy(publish.comment_policy);
        }
        if (typeof publish.download_enabled === "boolean" && !touched.has("download")) {
          setDownloadEnabled(publish.download_enabled);
        }
      })
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
    titleTouchedRef.current = false;
    setDescription("");
    setCategory("");
    setLanguage("");
    setLicense("");
    setTags([]);
    setPublishAt("");
    setVideoUrl("");
    setResumeCandidate(null);
    setFileName(null);
    setPickedFile(null);
    setFileMeta(null);
    setDraftId(null);
    draftIdRef.current = null;
    uploadedVideoRef.current = null;
    setPublishPending(false);
    publishPendingRef.current = false;
    setBytes(null);
    setImportJob(null);
    setRetryCtx(null);
    if (fileRef.current) fileRef.current.value = "";
    // Publish succeeded — minimize the sheet so the section's success message
    // (and the "View" link) is visible; the next open starts a fresh pick.
    setOpen(false);
    setStep("pick");
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
        // The URL field lives on the pick step; a 422 targeting it bounces the
        // sheet back so the inline error is visible next to the input.
        if (map.url) setStep("pick");
        return true;
      }
    }
    return false;
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

  // handleFiles routes picked/dropped file(s). More than one file switches to the
  // batch upload queue (UPLOAD-10, untouched). A single file now AUTO-STARTS: it
  // prefills the title from the filename (unless the creator typed one), reads
  // display-only technical metadata, advances to the details step, and kicks off
  // the resumable upload against a fresh private draft — no separate Continue.
  // The one exception is a matching resumable session (same filename + size) left
  // by an interrupted upload: that keeps the pick step's Resume/Discard banner.
  function handleFiles(files: File[]) {
    setError(null);
    if (files.length > 1) {
      // Hand the files to the batch queue and reset the single-file input so the
      // form returns clean when the batch is cleared.
      setBatchFiles(files);
      if (fileRef.current) fileRef.current.value = "";
      setFileName(null);
      setPickedFile(null);
      setResumeCandidate(null);
      return;
    }
    const file = files[0];
    if (!file) {
      // The picker was dismissed / cleared — return to the empty pick state.
      setFileName(null);
      setPickedFile(null);
      setResumeCandidate(null);
      setFileMeta(null);
      return;
    }
    setFieldErrors({});
    setFileName(file.name);
    setPickedFile(file);
    const resume = findResumableUploadSession(file);
    setResumeCandidate(resume);

    // Prefill the title from the filename only when it is still empty AND
    // untouched — a typed title is never clobbered (the required regression).
    const willPrefill = title.trim() === "" && !titleTouchedRef.current;
    const derivedTitle = willPrefill
      ? titleFromFilename(file.name).slice(0, 200)
      : title;
    if (willPrefill) setTitle(derivedTitle);

    // Display-only technical metadata (duration/resolution) via a hidden <video>.
    probeFileMetadata(file);

    // A matching unfinished session takes precedence: stay on the pick step and
    // let the Resume/Discard banner drive (auto-starting would orphan its chunks).
    if (resume) return;

    // Advance immediately and auto-start the upload against a private draft. Pass
    // the derived title explicitly (a setTitle above has not flushed into `title`
    // yet within this tick).
    setStep("details");
    void startAutoUpload(file, derivedTitle.trim() || titleFromFilename(file.name).slice(0, 200));
  }

  // onFileInputChange bridges the transparent file <input> to handleFiles.
  function onFileInputChange() {
    handleFiles([...(fileRef.current?.files ?? [])]);
  }

  // probeFileMetadata reads duration + intrinsic resolution from a throwaway
  // <video preload="metadata"> pointed at an object URL, purely for the file
  // card's chips. It degrades silently (no chips) on any error, and always
  // revokes the object URL. This is display-only — nothing here reaches the API.
  function probeFileMetadata(file: File) {
    setFileMeta(null);
    metaProbeCleanupRef.current?.();
    metaProbeCleanupRef.current = null;
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      metaProbeCleanupRef.current = null;
    };
    metaProbeCleanupRef.current = cleanup;
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      setFileMeta({
        duration: Number.isFinite(el.duration) ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      });
      cleanup();
    };
    el.onerror = cleanup;
    el.src = url;
  }

  // startAutoUpload creates the private draft (title only + explicit private) and
  // runs the resumable upload for the file path. On completion it stores the
  // finished video; if the creator has already pressed Publish (publishPending)
  // it finalises the outcome, otherwise it parks in the "uploaded" phase awaiting
  // Publish. A cancel deletes the draft; a draft-create/upload failure keeps the
  // picked file and surfaces a retryable error.
  async function startAutoUpload(file: File, draftTitle: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = null;
    publishPendingRef.current = false;
    setPublishPending(false);
    uploadedVideoRef.current = null;
    setDraftId(null);
    draftIdRef.current = null;
    setState("uploading");
    setProgress(0);
    setBytes(null);
    setUploadPhase("uploading");
    setError(null);
    setFieldErrors({});
    setResult(null);
    setRetryCtx(null);
    let createdId: string | null = null;
    try {
      // Clear any lingering resumable session for this exact file first, so the
      // fresh upload never leaves an orphan behind.
      const stale = findResumableUploadSession(file);
      if (stale) await discardSession(stale);
      setResumeCandidate(null);

      // Title only + EXPLICIT private: the instance default privacy is ambiguous,
      // and privacy is the one thing keeping an auto-published upload out of
      // public view until the creator presses Publish. The publish-timing opt-in
      // rides along when set (sticky from a previous attempt) so the flag is on
      // the video BEFORE upload completion — that is what makes the server hold it.
      const draft = await api.createVideoDraft(handle, {
        title: draftTitle,
        privacy: "private",
        ...(publishAfterTranscode ? { publish_after_transcode: true } : {}),
      });
      createdId = draft.id;
      setDraftId(draft.id);
      draftIdRef.current = draft.id;
      // Cancel clicked while the draft POST was still in flight: stop before the
      // upload starts and clean up the just-created draft.
      if (controller.signal.aborted) {
        void api.deleteVideo(draft.id).catch(() => {});
        setState("cancelled");
        resetFileToPick();
        return;
      }
      const res = await resumableUpload(draft.id, file, {
        onProgress: (p) => {
          setProgress(p.percent);
          setBytes({ loaded: p.loaded, total: p.total });
          setUploadPhase(p.phase ?? "uploading");
        },
        signal: controller.signal,
        onSessionOpened: (id) => {
          sessionIdRef.current = id;
        },
      });
      uploadedVideoRef.current = res.video;
      if (res.video.state === "failed") {
        // A probe/scan rejected the file: nothing to publish, surface it honestly.
        setError(failedStateError("file"));
        setState("error");
        return;
      }
      if (publishPendingRef.current) {
        // Publish was pressed mid-upload (metadata already PATCHed) — finalise now.
        finishWithVideo(res.video, "file");
      } else {
        setState("uploaded");
      }
    } catch (err) {
      // A local cancellation is not an error: DELETE the session (dropping its
      // chunk blobs) and the orphaned draft, then return to the pick step.
      if (isUploadCancelled(err)) {
        if (sessionIdRef.current) {
          void api.cancelUploadSession(sessionIdRef.current).catch(() => {});
          forgetUploadSession(sessionIdRef.current);
        }
        const idToDelete = createdId ?? draftIdRef.current;
        // Best-effort cleanup: a failed delete just leaves a private draft that
        // the draft-recovery flow can still reach — log it, never surface it.
        if (idToDelete) {
          void api
            .deleteVideo(idToDelete)
            .catch(() => logger.warn("cancelled upload: draft delete failed", { video_id: idToDelete }));
        }
        setState("cancelled");
        resetFileToPick();
        return;
      }
      // Draft-create (422 quota / 403 feature_disabled / 429) or upload failure:
      // keep the picked file, map the error inline, and offer a retry.
      if (applyFieldErrors(err)) return;
      setError(importOrUploadError(err, "file"));
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }

  // resetFileToPick returns to the pick step after a cancel, keeping the metadata
  // form intact (title, description, …) but dropping the file-specific state so a
  // fresh pick starts clean.
  function resetFileToPick() {
    setStep("pick");
    setPickedFile(null);
    setFileName(null);
    setFileMeta(null);
    setDraftId(null);
    draftIdRef.current = null;
    uploadedVideoRef.current = null;
    setPublishPending(false);
    publishPendingRef.current = false;
    setProgress(0);
    setBytes(null);
    setUploadPhase("uploading");
    metaProbeCleanupRef.current?.();
    metaProbeCleanupRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  }

  // publishFileMetadata is Publish for the file path: apply the form metadata to
  // the auto-created draft (PATCH) and go live. If the upload has finished, the
  // outcome is derived at once; if it is still in flight, the PATCH lands now and
  // completion (in startAutoUpload) finalises when the bytes arrive.
  async function publishFileMetadata() {
    const id = draftIdRef.current ?? draftId;
    if (!id || publishPendingRef.current) return;
    setError(null);
    setFieldErrors({});
    const scheduleIso = scheduleToIso(publishAt);
    const body: UpdateVideoRequest = {
      title: title.trim(),
      description: description.trim(),
      privacy,
      ...taxonomyFields(category, language, license),
      ...(tags.length > 0 ? { tags } : {}),
      ...(scheduleIso ? { publish_at: scheduleIso } : {}),
      is_sensitive: sensitive,
      // Clear the reason when the flag is off; otherwise send the trimmed text.
      sensitive_reason: sensitive ? sensitiveReason.trim() : "",
      comments_policy: commentsPolicy,
      download_enabled: downloadEnabled,
      // Harmless when unchanged (the flip already synced it) — keeps the final
      // metadata PATCH the complete picture of the form.
      publish_after_transcode: publishAfterTranscode,
    };
    try {
      const patched = await api.updateVideo(id, body);
      // Read the LATEST upload status (ref, not the closure) — the upload may have
      // completed while the PATCH was in flight.
      if (uploadedVideoRef.current) {
        // Bytes already landed: the PATCH result carries the authoritative final
        // state (published / scheduled / quarantined / failed) + new metadata.
        finishWithVideo(patched, "file");
      } else {
        // Still uploading: remember the intent; completion will finalise. The ref
        // is set before the state so the completion handler (which reads the ref)
        // never misses it.
        publishPendingRef.current = true;
        setPublishPending(true);
      }
    } catch (err) {
      // A 422 (e.g. publish_at on an already-published video, or a bad title)
      // renders inline; anything else is a mapped form-level error.
      if (applyFieldErrors(err)) return;
      setError(importOrUploadError(err, "file"));
      setState("error");
    }
  }

  // togglePublishTiming flips the publish-after-transcode opt-in. Once the
  // auto-created draft exists the flip is synced IMMEDIATELY with a
  // single-field PATCH — the server's hold decision happens at
  // upload-completion time, so the flag must be on the video before the bytes
  // finish, not only at Publish. A failed sync reverts the toggle and surfaces
  // an inline error; before the draft exists (URL tab, or a create still in
  // flight) the state alone carries it into the create/Publish bodies.
  async function togglePublishTiming(next: boolean) {
    setPublishTimingError(null);
    setPublishAfterTranscode(next);
    const id = draftIdRef.current;
    if (!id) return;
    try {
      await api.updateVideo(id, { publish_after_transcode: next });
    } catch (err) {
      setPublishAfterTranscode(!next);
      setPublishTimingError(
        errorMessage(err, "Couldn’t update the publish timing. Please try again."),
      );
    }
  }

  // retryUpload re-runs the auto-start after a draft-create/upload failure, using
  // the already-picked file and the current (possibly typed) title.
  function retryUpload() {
    const file = pickedFile;
    if (!file || state === "uploading") return;
    const draftTitle = title.trim() || titleFromFilename(file.name).slice(0, 200);
    void startAutoUpload(file, draftTitle);
  }

  // Drag-and-drop: the transparent file input only covers the OS picker; real
  // drops need explicit handlers (with a visible drag-over state) that route the
  // dropped video(s) through the same handleFiles path. preventDefault on drop
  // stops the browser also populating the input (which would double-handle).
  function onDropZoneDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDropZoneDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (state !== "uploading") setDragOver(true);
  }
  function onDropZoneDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }
  function onDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = [...(e.dataTransfer?.files ?? [])];
    if (dropped.length === 0) return;
    // Keep only accepted video files (the server's 415 stays the final authority).
    const videos = dropped.filter((f) => isAcceptedVideoFile(f, additionalExts));
    if (videos.length === 0) {
      setError("That is not a supported video type.");
      return;
    }
    handleFiles(videos);
  }

  // openSheet launches the stepped upload Modal. A fresh (idle/done) open starts
  // at the pick step; reopening while an upload is in flight — or after an
  // error/cancel — lands on the details step where the progress/outcome lives.
  function openSheet() {
    if (
      state === "uploading" ||
      state === "uploaded" ||
      state === "error" ||
      state === "cancelled"
    ) {
      setStep("details");
    } else {
      if (state === "done") {
        setState("idle");
        setResult(null);
      }
      setStep("pick");
    }
    setOpen(true);
  }

  // A `?upload=1` deep link opens the sheet, then reports back so the caller can
  // strip the param (router.replace). Fires on every false→true transition of the
  // param — not just the first mount — so re-triggering "+ Create → Upload video"
  // while ALREADY on /studio/content reopens the sheet (and re-strips the param).
  // The guard resets whenever the param is stripped (autoOpen back to false).
  useEffect(() => {
    if (!autoOpen) {
      autoOpenedRef.current = false;
      return;
    }
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    openSheet();
    onAutoOpenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // upload is the form's submit (Publish). The file path's bytes already started
  // on select, so Publish there just applies metadata (publishFileMetadata). The
  // URL path is unchanged: it creates the draft with the full metadata on submit,
  // then enqueues + polls the import.
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim() === "" || handle === "") return;
    if (source === "file") {
      void publishFileMetadata();
      return;
    }
    // ---- URL import path (create draft with full metadata → import) ----
    const url = videoUrl.trim();
    if (state === "uploading" || url === "") return;
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = null;
    setState("uploading");
    setProgress(0);
    setError(null);
    setFieldErrors({});
    setResult(null);
    setRetryCtx(null);
    let createdDraftId: string | null = null;
    try {
      const scheduleIso = scheduleToIso(publishAt);
      const draft = await api.createVideoDraft(handle, {
        title: title.trim(),
        description: description.trim(),
        privacy,
        ...taxonomyFields(category, language, license),
        ...(tags.length > 0 ? { tags } : {}),
        ...(scheduleIso ? { publish_at: scheduleIso } : {}),
        ...(sensitive ? { is_sensitive: true } : {}),
        ...(sensitive && sensitiveReason.trim() ? { sensitive_reason: sensitiveReason.trim() } : {}),
        ...(publishAfterTranscode ? { publish_after_transcode: true } : {}),
        // Per-video publish policies (W9): the visible form state is what is
        // saved (it was prefilled from defaults.publish, so an untouched form
        // still matches the instance defaults).
        comments_policy: commentsPolicy,
        download_enabled: downloadEnabled,
      });
      createdDraftId = draft.id;
      // Cancel clicked while the draft POST was still in flight: stop before the
      // import starts and clean up the just-created draft.
      if (controller.signal.aborted) {
        void api.deleteVideo(draft.id).catch(() => {});
        setState("cancelled");
        return;
      }
      // runImport owns the URL outcome (rail, prefill, retry, disabled) and its
      // own error handling, so it never falls through to this catch.
      await runImport(draft.id, url, controller);
    } catch (err) {
      if (isUploadCancelled(err)) {
        if (createdDraftId) void api.deleteVideo(createdDraftId).catch(() => {});
        setState("cancelled");
        return;
      }
      if (applyFieldErrors(err)) return;
      setError(importOrUploadError(err, "url"));
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }

  // resumeUpload continues an interrupted upload for the re-picked file: read the
  // session's received chunks, then PUT only the missing ones and complete. The
  // draft already carries the original metadata, so nothing is re-created.
  async function resumeUpload() {
    const file = pickedFile;
    const cand = resumeCandidate;
    if (!cand || !file || state === "uploading") return;
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = cand.uploadId;
    // Move to the details step so the in-flight progress + Cancel are visible.
    setStep("details");
    setState("uploading");
    setProgress(0);
    setUploadPhase("uploading");
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
          setUploadPhase(p.phase ?? "uploading");
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

  // Whether the pick step has enough to advance to details: a chosen file, or a
  // non-empty URL on an instance that accepts imports.
  const canContinue =
    source === "file" ? fileName !== null : videoUrl.trim() !== "" && importsEnabled !== false;

  // The metadata form stays editable while a FILE uploads (the creator fills in
  // details in parallel); it locks only for a URL import in flight or once the
  // file's Publish has been committed (publishPending).
  const formLocked = (source === "url" && state === "uploading") || publishPending;

  // Display-only technical chips for the file card (size + container are always
  // known from the File; duration + resolution appear once the probe resolves).
  const fileChips: string[] = [];
  if (pickedFile) {
    fileChips.push(formatBytes(pickedFile.size));
    const container = pickedFile.type.split("/")[1]?.toUpperCase();
    if (container) fileChips.push(container);
    if (fileMeta?.duration != null) fileChips.push(formatDuration(fileMeta.duration));
    if (fileMeta?.width && fileMeta?.height) fileChips.push(`${fileMeta.width}×${fileMeta.height}`);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Upload a video</h2>
        <Button onClick={openSheet}>Upload video</Button>
      </div>
      {/* Section-level outcome: a successful publish minimizes the sheet and
          surfaces the honest result here (with a "View" link) so it stays
          visible after the sheet closes. */}
      {state === "done" && result ? (
        result.state === "published" ? (
          <p role="status" className="text-sm text-success">
            Published!{" "}
            <Link href={`/videos/${result.id}`} className="font-semibold underline">
              View “{result.title}”
            </Link>
          </p>
        ) : result.state === "scheduled" ? (
          <p role="status" className="text-sm text-fg-muted">
            “{result.title}” is scheduled — it will publish automatically
            {result.publish_at
              ? ` on ${formatDateTime(result.publish_at)}`
              : " at the scheduled time"}
            .
          </p>
        ) : result.state === "quarantined" ? (
          <p role="status" className="text-sm text-warning">
            “{result.title}” was received and is held for review — this instance reviews new uploads
            before they go public. It will publish once a moderator approves it.
          </p>
        ) : (
          <p role="status" className="text-sm text-warning">
            “{result.title}” was received and is still processing — it will appear in Your videos
            once it’s ready.
          </p>
        )
      ) : null}
      {open ? (
        <Modal
          title="Upload video"
          onClose={() => setOpen(false)}
          variant={sheet ? "sheet" : "dialog"}
          className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        >
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
            <form onSubmit={(e) => void upload(e)} className="flex flex-col gap-4">
              {step === "pick" ? (
                // Stage 1 — pick: choose the source and the file/URL. A single file
                // auto-advances + auto-uploads; the URL path uses an explicit Continue.
                <>
                  {state === "cancelled" ? (
                    // A cancelled file upload lands back here — the metadata form is
                    // kept; choosing (or dropping) a file starts a fresh upload.
                    <p role="status" className="text-sm text-fg-muted">
                      Upload cancelled — nothing was published. Your details are kept, so choose a
                      file to start again.
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span id="video-source-label" className="font-medium text-fg">
                      Source
                    </span>
                    <SegmentedControl
                      value={source}
                      onChange={changeSource}
                      labelledBy="video-source-label"
                      disabled={state === "uploading" || state === "uploaded"}
                      fullWidth
                      options={[
                        { value: "file", label: "Upload file" },
                        { value: "url", label: "Import from URL" },
                      ]}
                    />
                  </div>
                  {source === "file" ? (
                    // Design's dashed dropzone: the file input is a full-bleed
                    // transparent overlay (still labelled "Video file" for
                    // pickers + tests + keyboard), with the visual chrome painted
                    // underneath and a keyboard focus ring off `peer-focus-visible`.
                    // Real drag-and-drop is layered on the wrapper (the input's
                    // accept only filters the OS picker), with an accent drag-over.
                    <div className="flex flex-col gap-2 text-sm">
                      <span className="font-medium text-fg">Video file</span>
                      <div
                        className="relative"
                        onDragEnter={onDropZoneDragEnter}
                        onDragOver={onDropZoneDragOver}
                        onDragLeave={onDropZoneDragLeave}
                        onDrop={onDropZoneDrop}
                      >
                        <input
                          ref={fileRef}
                          type="file"
                          // The accept list narrows to the base containers when the
                          // admin turns the extended set off (W10) — the server's
                          // 415 gate stays the enforcement truth.
                          accept={videoAcceptAttr(additionalExts)}
                          multiple
                          aria-label="Video file"
                          onChange={onFileInputChange}
                          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        />
                        <div
                          className={cn(
                            "pointer-events-none flex flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed px-6 py-9 text-center transition-colors peer-hover:border-fg-muted peer-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)]",
                            dragOver ? "border-accent bg-accent/8" : "border-border",
                          )}
                        >
                          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/12">
                            <UploadIcon size={24} className="text-accent" />
                          </span>
                          <span className="max-w-full truncate text-[15px] font-semibold text-fg">
                            {dragOver ? "Drop to upload" : (fileName ?? "Choose or drop a video")}
                          </span>
                          <span className="text-[13px] leading-relaxed text-fg-muted">
                            MP4, MOV, WebM, MKV · up to 8 GB
                            <br />
                            Starts uploading as soon as you choose · pick several for a batch
                          </span>
                        </div>
                      </div>
                      <span className="text-center text-xs text-fg-muted">
                        New uploads are scanned and may be held briefly for review.
                      </span>
                    </div>
                  ) : importsEnabled === false ? (
                    // Imports are turned off on this instance — an honest empty
                    // state, never a dead form the creator can submit into a 503.
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
                          // Paste-detect: a pasted http(s) URL is trimmed of the
                          // stray whitespace/newlines that ride along a copied link.
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
                        A public link to a video file or a supported platform watch page. We fetch,
                        scan, and publish it.
                      </span>
                    </label>
                  )}
                  {source === "file" && resumeCandidate && state !== "uploading" ? (
                    // A resumable session was left by an interrupted upload of this
                    // exact file — offer to resume from the chunks that landed.
                    <div
                      role="status"
                      className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4 text-sm"
                    >
                      <p className="text-fg">
                        Unfinished upload found for “{resumeCandidate.filename}
                        ”. Resume where you left off, or start a new upload.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void resumeUpload()}>
                          Resume upload
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            // Discard the old session, then start fresh: advance to
                            // details and auto-upload the re-picked file.
                            const file = pickedFile;
                            void discardSession(resumeCandidate);
                            setResumeCandidate(null);
                            if (file) {
                              const draftTitle =
                                title.trim() || titleFromFilename(file.name).slice(0, 200);
                              setStep("details");
                              void startAutoUpload(file, draftTitle);
                            }
                          }}
                        >
                          Discard &amp; start over
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {source === "url" ? (
                    // The URL path still uses an explicit Continue (there is nothing
                    // to auto-start before submit); the file path advances on select.
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Button type="button" onClick={() => setStep("details")} disabled={!canContinue}>
                        Continue
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                // Stage 2 — details → publish: the metadata form, then Publish (and
                // the in-flight progress / outcome for the third, "publish" stage).
                <>
                  {source === "url" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-fg-muted">
                      <span className="tabular-nums font-medium text-fg-muted">
                        Step 2 of 2 · Details
                      </span>
                      <span className="truncate">{videoUrl.trim() || "Import from URL"}</span>
                    </div>
                  ) : pickedFile ? (
                    // File card: filename, technical chips, and the live upload
                    // progress / uploaded state, with a Cancel affordance while the
                    // bytes are still moving.
                    <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-muted p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-strong">
                            <VideoIcon size={18} className="text-fg-muted" />
                          </span>
                          <span className="min-w-0 truncate text-sm font-semibold text-fg">
                            {fileName}
                          </span>
                        </div>
                        {state === "uploading" && uploadPhase === "processing" ? (
                          // The server has the bytes and is finalising them —
                          // there is nothing left to cancel, and no byte counter
                          // to show.
                          <span
                            role="status"
                            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-fg-muted"
                          >
                            <LoaderIcon size={14} className="animate-spin" aria-hidden="true" />{" "}
                            Processing…
                          </span>
                        ) : state === "uploading" && !publishPending ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label="Cancel upload"
                            onClick={cancelUpload}
                          >
                            Cancel
                          </Button>
                        ) : state === "uploaded" ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-success">
                            <CheckIcon size={14} aria-hidden="true" /> Uploaded
                          </span>
                        ) : null}
                      </div>
                      {fileChips.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {fileChips.map((chip) => (
                            <span
                              key={chip}
                              className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-medium tabular-nums text-fg-muted"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {state === "uploading" ? (
                        <div className="flex items-center gap-2">
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
                        </div>
                      ) : null}
                      {state === "uploading" && uploadPhase === "processing" ? (
                        <p className="text-[12.5px] text-fg-muted">
                          Upload complete — we’re processing your video. This can take a few minutes
                          for a large file; you can keep filling in the details.
                        </p>
                      ) : state === "uploading" && bytes ? (
                        <p className="text-[12.5px] tabular-nums text-fg-muted">
                          {formatBytes(bytes.loaded)} of {formatBytes(bytes.total)} · resumes from the
                          last completed chunk if interrupted
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
                      aria-describedby={
                        fieldErrors.description ? "publish-description-error" : undefined
                      }
                      className={`resize-y ${FIELD}`}
                    />
                    <FieldErrorText
                      id="publish-description-error"
                      message={fieldErrors.description}
                    />
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
                    onChange={(v) => {
                      publishTouchedRef.current.add("license");
                      setLicense(v);
                    }}
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
                        onChange={(e) => {
                          publishTouchedRef.current.add("privacy");
                          setPrivacy(e.target.value as VideoPrivacy);
                        }}
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
                      disabled={formLocked}
                    />
                  </div>
                  {/* Optional creator content-warning, revealed only while the
                      flag is on. Shown to viewers on the sensitive-content gate. */}
                  {sensitive ? (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-fg">Content warning (optional)</span>
                      <input
                        value={sensitiveReason}
                        onChange={(e) => setSensitiveReason(e.target.value)}
                        placeholder="Briefly describe what viewers will see"
                        aria-label="Content warning"
                        maxLength={280}
                        disabled={formLocked}
                        className={FIELD}
                      />
                    </label>
                  ) : null}
                  {/* Per-video publish policies (config-parity W9), prefilled from the
            instance defaults.publish block. */}
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <span className="block font-medium text-fg">Allow comments</span>
                      <span className="block text-xs text-fg-muted">
                        Viewers can comment on this video. Existing comments stay visible if turned
                        off later.
                      </span>
                    </div>
                    <Toggle
                      checked={commentsPolicy === "enabled"}
                      onChange={(on) => {
                        publishTouchedRef.current.add("comments");
                        setCommentsPolicy(on ? "enabled" : "disabled");
                      }}
                      label="Allow comments"
                      disabled={formLocked}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <span className="block font-medium text-fg">Allow downloads</span>
                      <span className="block text-xs text-fg-muted">
                        Viewers can download this video&apos;s files — only while the instance
                        allows downloads at all.
                      </span>
                    </div>
                    <Toggle
                      checked={downloadEnabled}
                      onChange={(on) => {
                        publishTouchedRef.current.add("download");
                        setDownloadEnabled(on);
                      }}
                      label="Allow downloads"
                      disabled={formLocked}
                    />
                  </div>
                  {/* Publish timing (publish_after_transcode): hold until the HLS
                      transcode completes. Disabled under a schedule — server-side,
                      publish_at takes precedence. */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <div className="min-w-0">
                        <span className="block font-medium text-fg">Publish after transcoding</span>
                        <span className="block text-xs text-fg-muted">
                          {publishAt.trim() !== ""
                            ? "Scheduled videos publish at the scheduled time."
                            : "Your video stays hidden until processing finishes. Otherwise it goes live immediately and viewers watch the original file while processing completes."}
                        </span>
                      </div>
                      <Toggle
                        checked={publishAfterTranscode}
                        onChange={(on) => void togglePublishTiming(on)}
                        label="Publish after transcoding"
                        disabled={formLocked || publishAt.trim() !== ""}
                      />
                    </div>
                    <FieldErrorText id="publish-timing-error" message={publishTimingError ?? undefined} />
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-fg">Schedule publish (optional)</span>
                    <input
                      type="datetime-local"
                      value={publishAt}
                      onChange={(e) => setPublishAt(e.target.value)}
                      aria-label="Schedule publish"
                      aria-invalid={fieldErrors.publish_at ? true : undefined}
                      aria-describedby={
                        fieldErrors.publish_at ? "publish-schedule-error" : undefined
                      }
                      className={FIELD}
                    />
                    <FieldErrorText id="publish-schedule-error" message={fieldErrors.publish_at} />
                    <span className="text-xs text-fg-muted">
                      Leave empty to publish as soon as processing finishes. A scheduled video stays
                      hidden from public surfaces until this time (must be in the future).
                    </span>
                  </label>
                  {source === "url" && state === "uploading" ? (
                    <ImportStageRail job={importJob} />
                  ) : null}
                  {publishPending ? (
                    // File path: the metadata PATCH landed while the bytes are still
                    // moving — the video goes live automatically once the upload
                    // finishes (branching on its final state).
                    <p role="status" className="text-sm text-fg-muted">
                      Publishing when the upload completes…
                    </p>
                  ) : null}
                  {state === "cancelled" ? (
                    <p role="status" className="text-sm text-fg-muted">
                      Upload cancelled — nothing was published. Your details are kept so you can try
                      again.
                    </p>
                  ) : null}
                  {error ? (
                    <div className="flex flex-col items-start gap-2">
                      <p role="alert" className="text-sm text-danger">
                        {error}
                      </p>
                      {retryCtx ? (
                        // A failed URL import keeps its draft, so Retry re-enqueues against
                        // the same video via the same endpoint — no re-entry of the form.
                        <Button variant="secondary" size="sm" onClick={() => void retryImport()}>
                          Retry import
                        </Button>
                      ) : source === "file" && pickedFile ? (
                        // A failed draft-create/upload keeps the picked file — retry
                        // restarts the auto-upload without re-choosing the file.
                        <Button variant="secondary" size="sm" onClick={retryUpload}>
                          Retry upload
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {source === "url" ? (
                      <Button
                        type="button"
                        variant="tonal"
                        onClick={() => setStep("pick")}
                        disabled={state === "uploading"}
                      >
                        Back
                      </Button>
                    ) : null}
                    <button
                      ref={publishRef}
                      type="submit"
                      disabled={
                        source === "url"
                          ? state === "uploading" || importsEnabled === false
                          : draftId === null || publishPending
                      }
                      className={buttonClasses("primary", "md")}
                    >
                      {source === "url"
                        ? state === "uploading"
                          ? "Importing…"
                          : "Publish"
                        : publishPending
                          ? "Publishing…"
                          : "Publish"}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </Modal>
      ) : null}
      {/* Minimized progress pill (design): a persistent bottom-right capsule that
          keeps the in-flight upload reachable while the sheet is minimized —
          click to reopen. Chrome-level, so monochrome surface + accent spinner. */}
      {state === "uploading" && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring fixed bottom-24 right-4 z-40 flex items-center gap-2.5 rounded-full bg-surface-raised px-4 py-2.5 shadow-soft-strong sm:bottom-6"
        >
          <LoaderIcon size={16} className="animate-spin text-accent" aria-hidden="true" />
          <span className="text-[13px] font-semibold tabular-nums text-fg">
            {source === "url" ? "Importing…" : `Uploading ${progress}%`}
          </span>
        </button>
      ) : null}
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
