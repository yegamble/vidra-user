"use client";

import { useEffect, useMemo, useState } from "react";

import { DownloadIcon } from "@/components/icons";
import { Button, Checkbox, Modal, Radio } from "@/components/ui";
import { api, errorMessage, type Video, type VideoDownloadFile } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useVideoActionPermissions } from "@/lib/use-video-action-permissions";

const PILL =
  "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong";

type DownloadMode = "video" | "audio" | "subtitles";

function modeFor(file: VideoDownloadFile): DownloadMode {
  if (file.kind === "audio") return "audio";
  if (file.kind === "subtitle") return "subtitles";
  return "video";
}

function videoRank(file: VideoDownloadFile): number {
  if (file.kind === "hls") return 3_000_000 + (file.height ?? 0);
  if (file.kind === "webm") return 2_000_000 + (file.height ?? 0);
  return 1_000_000 + (file.height ?? 0);
}

function fileTitle(file: VideoDownloadFile): string {
  if (file.kind === "hls") return file.height ? `${file.height}p` : "HLS video";
  if (file.kind === "webm") return file.height ? `${file.height}p WebM` : "WebM transcode";
  if (file.kind === "original") return "Original file";
  if (file.kind === "audio") return "Audio only";
  return file.label || file.language || "Subtitles";
}

function fileDetails(file: VideoDownloadFile): string {
  const details: string[] = [];
  if (file.size_bytes !== undefined) details.push(formatBytes(file.size_bytes));
  if (file.width && file.height) details.push(`${file.width}×${file.height}`);
  if (file.kind === "subtitle" && file.language) details.push(file.language);
  if (file.kind === "original" && file.original_name) details.push(file.original_name);
  return details.join(" · ");
}

/** Watch-page download action, hidden when instance policy disallows it. */
export function DownloadButton({
  video,
  playbackToken,
}: {
  video: Video;
  playbackToken?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { canDownload } = useVideoActionPermissions(video);

  if (!canDownload) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={PILL}>
        <DownloadIcon size={16} strokeWidth={2} />
        <span>Download</span>
      </button>
      {open ? (
        <DownloadDialog
          videoId={video.id}
          playbackToken={playbackToken}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Download picker shared by the watch page and thumbnail overflow menu. It
 * lists only assets that actually exist and fetches the chosen attachment with
 * the current bearer token so moderators can download restricted videos too.
 */
export function DownloadDialog({
  videoId,
  playbackToken,
  onClose,
}: {
  videoId: string;
  playbackToken?: string | null;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<VideoDownloadFile[]>([]);
  const [mode, setMode] = useState<DownloadMode>("video");
  const [selectedUrl, setSelectedUrl] = useState("");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const video = files
      .filter((file) => modeFor(file) === "video")
      .sort((a, b) => videoRank(b) - videoRank(a));
    return {
      video,
      audio: files.filter((file) => file.kind === "audio"),
      subtitles: files.filter((file) => file.kind === "subtitle"),
    };
  }, [files]);

  const visibleFiles = grouped[mode];
  const selected = files.find((file) => file.url === selectedUrl);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoDownloads(videoId, playbackToken ?? undefined, controller.signal)
      .then((response) => {
        const ordered = [...response.files];
        setFiles(ordered);
        const videoFiles = ordered
          .filter((file) => modeFor(file) === "video")
          .sort((a, b) => videoRank(b) - videoRank(a));
        const first = videoFiles[0] ?? ordered[0];
        if (first) {
          const firstMode = modeFor(first);
          setMode(firstMode);
          setSelectedUrl(first.url);
        }
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, "Could not load the available downloads."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [playbackToken, videoId]);

  function selectMode(next: DownloadMode) {
    setMode(next);
    const nextFiles = grouped[next];
    setSelectedUrl(nextFiles[0]?.url ?? "");
    setIncludeAudio(true);
    setError(null);
  }

  async function download() {
    if (!selected || downloading) return;
    setDownloading(true);
    setError(null);
    const path =
      selected.kind === "hls" && !includeAudio && selected.video_only_url
        ? selected.video_only_url
        : selected.url;
    try {
      const blob = await api.fetchVideoDownload(videoId, path, playbackToken ?? undefined);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = selected.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setError(errorMessage(err, "Could not download this file."));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal title="Download" onClose={onClose} className="max-w-2xl">
      <div className="flex min-h-72 flex-col gap-5">
        <label className="flex items-center gap-3 text-sm font-medium text-fg">
          <span>Format</span>
          <select
            aria-label="Download format"
            value={mode}
            onChange={(event) => selectMode(event.target.value as DownloadMode)}
            className="focus-ring min-h-11 min-w-44 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg sm:min-h-9"
          >
            <option value="video" disabled={grouped.video.length === 0}>Video</option>
            <option value="audio" disabled={grouped.audio.length === 0}>Audio only</option>
            <option value="subtitles" disabled={grouped.subtitles.length === 0}>Subtitles</option>
          </select>
        </label>

        {loading ? (
          <p role="status" className="py-8 text-center text-sm text-fg-muted">
            Loading available formats…
          </p>
        ) : visibleFiles.length > 0 ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">Choose a {mode} download</legend>
            {visibleFiles.map((file) => {
              const details = fileDetails(file);
              return (
                <div
                  key={`${file.kind}:${file.url}`}
                  className="rounded-xl px-3 py-2 transition-colors hover:bg-surface-muted"
                >
                  <Radio
                    name={`download-${videoId}`}
                    value={file.url}
                    checked={selectedUrl === file.url}
                    onChange={() => {
                      setSelectedUrl(file.url);
                      setIncludeAudio(true);
                    }}
                    label={
                      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                        <span className="font-semibold text-fg">{fileTitle(file)}</span>
                        {details ? <span className="text-fg-muted">{details}</span> : null}
                      </span>
                    }
                  />
                </div>
              );
            })}
          </fieldset>
        ) : (
          <p className="py-8 text-center text-sm text-fg-muted">
            No {mode === "subtitles" ? "subtitle files are" : `${mode} files are`} available yet.
          </p>
        )}

        {mode === "video" && selected?.kind === "hls" && selected.video_only_url ? (
          <div className="border-t border-border-subtle pt-4">
            <Checkbox
              checked={includeAudio}
              onChange={(event) => setIncludeAudio(event.target.checked)}
              label="Include audio in the same file"
            />
          </div>
        ) : null}

        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

        <div className="mt-auto flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button variant="secondary" disabled={downloading} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected || loading || downloading} onClick={() => void download()}>
            <DownloadIcon size={17} />
            {downloading ? "Preparing…" : "Download"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
