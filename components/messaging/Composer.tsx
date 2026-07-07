"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";
import { ApiError, api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { shouldSendOnEnter } from "@/lib/messaging/composer-keys";

const MAX_MESSAGE_LEN = 5000;
// The char counter only appears when the body is close to the cap (quiet until
// it matters), matching the spec's 4500 threshold.
const COUNTER_THRESHOLD = 4500;
const MAX_ATTACHMENTS = 4; // Messenger-parity 30 lands with core D6; 4 until then.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MiB, matching the backend cap.
const MAX_TEXTAREA_PX = 144; // ~6 lines, then the textarea scrolls internally.

// A file is allowed if it is an image, video, audio clip, or PDF (the backend
// attachment allowlist). Checked client-side for an instant error; the backend
// re-checks (415) authoritatively.
function isAllowedAttachment(file: File): boolean {
  const t = file.type;
  return (
    t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/") || t === "application/pdf"
  );
}

// uploadErrorMessage maps a backend attachment-upload failure to friendly copy.
function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "Too large (max 25 MiB).";
    if (err.status === 415) return "Unsupported type.";
    if (err.status === 422) return "Couldn't be attached.";
    if (err.status === 503) return "Attachments unavailable.";
  }
  return "Upload failed.";
}

// useFinePointer reports whether the primary pointer is fine (mouse/trackpad),
// via useSyncExternalStore so it is SSR-safe (server snapshot = false, no
// hydration mismatch) and stays correct if the pointer capability changes.
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(pointer: fine)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: fine)").matches,
    () => false,
  );
}

type PendingStatus = "uploading" | "ready" | "error";

interface PendingAttachment {
  localId: string;
  file: File;
  filename: string;
  size: number;
  isImage: boolean;
  thumbUrl?: string;
  status: PendingStatus;
  attachmentId?: string;
  error?: string;
  percent?: number;
}

// Composer v2 (Messaging v2 slice S5): an auto-growing textarea, a 44px circular
// icon send button, a keyboard contract that depends on the pointer (desktop
// Enter sends / Shift+Enter newline; coarse-pointer Enter is a newline and the
// button is the only send affordance), a char counter that appears near the cap,
// and attachment chips with local-file thumbnails + determinate upload progress
// + retry. Optimistic send is handled by the parent (onSend); the composer never
// hard-locks while a send is in flight.
export function Composer({
  conversationId,
  onSend,
}: {
  conversationId: string;
  onSend: (body: string, attachmentIds: string[]) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thumbUrlsRef = useRef<Set<string>>(new Set());

  // Only fine pointers (desktop mouse/trackpad) get Enter-to-send; touch/coarse
  // devices keep Enter as a newline and send via the button.
  const enterSends = useFinePointer();

  // Revoke every image-preview object URL we created when the composer unmounts.
  useEffect(() => {
    const urls = thumbUrlsRef.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  // Auto-grow: collapse to content height each keystroke, capped at ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [body]);

  const uploading = pending.some((p) => p.status === "uploading");
  const readyIds = pending
    .filter((p) => p.status === "ready" && p.attachmentId)
    .map((p) => p.attachmentId as string);
  const canSend = !uploading && (body.trim() !== "" || readyIds.length > 0);

  function updatePending(localId: string, patch: Partial<PendingAttachment>) {
    setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }

  function removePending(localId: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.thumbUrl) {
        URL.revokeObjectURL(target.thumbUrl);
        thumbUrlsRef.current.delete(target.thumbUrl);
      }
      return prev.filter((p) => p.localId !== localId);
    });
  }

  function startUpload(localId: string, file: File) {
    api
      .uploadDMAttachment(conversationId, file, {
        onProgress: (p) => updatePending(localId, { percent: p.percent }),
      })
      .then((res) =>
        updatePending(localId, { status: "ready", attachmentId: res.attachment_id, percent: 100 }),
      )
      .catch((err: unknown) =>
        updatePending(localId, { status: "error", error: uploadErrorMessage(err) }),
      );
  }

  function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = MAX_ATTACHMENTS - pending.length;
    if (remaining <= 0) {
      setError(`You can attach at most ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!isAllowedAttachment(file)) {
        setError("That file type isn't supported. Images, video, audio, and PDFs only.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError("That file is too large (max 25 MiB).");
        continue;
      }
      const localId = crypto.randomUUID();
      const isImage = file.type.startsWith("image/");
      let thumbUrl: string | undefined;
      if (isImage) {
        thumbUrl = URL.createObjectURL(file);
        thumbUrlsRef.current.add(thumbUrl);
      }
      setPending((prev) => [
        ...prev,
        {
          localId,
          file,
          filename: file.name,
          size: file.size,
          isImage,
          thumbUrl,
          status: "uploading",
          percent: 0,
        },
      ]);
      startUpload(localId, file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function retryUpload(localId: string) {
    const item = pending.find((p) => p.localId === localId);
    if (!item) return;
    updatePending(localId, { status: "uploading", error: undefined, percent: 0 });
    startUpload(localId, item.file);
  }

  function submit() {
    const trimmed = body.trim();
    if (uploading) return;
    if (trimmed === "" && readyIds.length === 0) return;
    onSend(trimmed, readyIds);
    for (const u of thumbUrlsRef.current) URL.revokeObjectURL(u);
    thumbUrlsRef.current.clear();
    setBody("");
    setPending([]);
    setError(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      shouldSendOnEnter({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing,
        enterSends,
      })
    ) {
      e.preventDefault();
      submit();
    }
  }

  const overCounter = body.length > COUNTER_THRESHOLD;

  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {pending.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Pending attachments">
          {pending.map((p) => (
            <li
              key={p.localId}
              className={cn(
                "flex w-full max-w-[16rem] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-xs",
                p.status === "error"
                  ? "border-danger-border bg-danger-surface"
                  : "border-border-subtle bg-surface-muted",
              )}
            >
              {p.isImage && p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- object-URL preview, not a static asset
                <img
                  src={p.thumbUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-fg-muted"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
                  </svg>
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium text-fg">{p.filename}</span>
                {p.status === "uploading" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-strong">
                      <span
                        className="block h-1 rounded-full bg-accent transition-[width]"
                        style={{ width: `${p.percent ?? 0}%` }}
                      />
                    </span>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {p.percent != null ? `${p.percent}%` : "Uploading…"}
                    </span>
                  </span>
                ) : p.status === "error" ? (
                  <span className="flex items-center gap-1.5 text-danger">
                    <span className="truncate">{p.error}</span>
                    <button
                      type="button"
                      onClick={() => retryUpload(p.localId)}
                      className="focus-ring shrink-0 rounded font-semibold underline transition-colors hover:text-fg"
                    >
                      Retry
                    </button>
                  </span>
                ) : (
                  <span className="tabular-nums text-fg-muted">{formatBytes(p.size)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removePending(p.localId)}
                aria-label={`Remove attachment ${p.filename}`}
                className="focus-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,application/pdf"
          multiple
          onChange={(e) => onFilesChosen(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending.length >= MAX_ATTACHMENTS}
          aria-label="Attach a file"
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-50"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          aria-label="Write a message"
          placeholder="Write a message…"
          rows={1}
          maxLength={MAX_MESSAGE_LEN}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          className="focus-ring max-h-36 w-full min-w-0 flex-1 resize-none overflow-y-auto rounded-[22px] bg-surface-muted px-4 py-2.5 text-[14.5px] leading-normal text-fg placeholder:text-fg-muted"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          aria-keyshortcuts={enterSends && canSend ? "Enter" : undefined}
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-40"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
      {overCounter ? (
        <p aria-live="polite" className="pr-14 text-right text-[11px] tabular-nums text-fg-muted">
          {body.length} / {MAX_MESSAGE_LEN}
        </p>
      ) : null}
    </form>
  );
}
