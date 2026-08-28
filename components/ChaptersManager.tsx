"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/icons";
import { ApiError, api } from "@/lib/api";
import type { VideoChapter } from "@/lib/api";
import {
  MAX_CHAPTERS,
  MAX_TITLE_LENGTH,
  formatChapterStart,
  validateChapters,
  type ChapterDraft,
  type ChapterValidationError,
} from "@/lib/chapters";
import { useAsyncAction } from "@/lib/use-async-action";

// Shared token recipe for the compact inline inputs (mirrors CaptionsManager).
const FIELD =
  "rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";

// A row carries a stable id so removing one mid-list never reshuffles the inputs
// (index keys would move values between fields).
interface Row extends ChapterDraft {
  id: number;
}

function errorKey(index: number, field: ChapterValidationError["field"]): string {
  return `${index}:${field}`;
}

// ChaptersManager is the creator's chapter editor (CORE-15), embedded in the
// studio's per-video edit surface. Rows of start (m:ss) + title, add/remove, with
// client-side validation mirroring the PUT contract (ascending starts, before the
// duration, 1–120 char titles, ≤100 rows). Save replaces the whole set; an empty
// set clears all chapters. Degrades to an empty, editable list if the initial
// fetch fails.
export function ChaptersManager({
  videoId,
  durationSeconds,
}: {
  videoId: string;
  /** The video's probed duration, when known — enables the "before the end" check. */
  durationSeconds?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ChapterValidationError[]>([]);
  const nextId = useRef(0);

  const makeRow = (start = "", title = ""): Row => ({ id: nextId.current++, start, title });

  const { run, busy, error, clearError } = useAsyncAction(
    async (chapters: VideoChapter[]) => {
      const res = await api.setVideoChapters(videoId, { chapters });
      setRows(res.chapters.map((c) => makeRow(formatChapterStart(c.start_seconds), c.title)));
      setFieldErrors([]);
      setSaved(true);
    },
    "Could not save the chapters.",
    (err) =>
      err instanceof ApiError && err.status === 400
        ? "Those chapters weren't accepted — check the times are in order and before the video ends."
        : null,
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoChapters(videoId, undefined, controller.signal)
      .then((res) => {
        setRows(res.chapters.map((c) => makeRow(formatChapterStart(c.start_seconds), c.title)));
        setLoaded(true);
      })
      .catch(() => {
        // No chapters to edit yet (or the fetch failed) — start from an empty,
        // still-editable list rather than blocking the surface.
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [videoId]);

  const errorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of fieldErrors) map.set(errorKey(e.index, e.field), e.message);
    return map;
  }, [fieldErrors]);

  function updateRow(id: number, patch: Partial<ChapterDraft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function addRow() {
    if (rows.length >= MAX_CHAPTERS) return;
    setRows((prev) => [...prev, makeRow()]);
    setSaved(false);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSaved(false);
  }

  function save() {
    if (busy) return;
    const result = validateChapters(rows, durationSeconds);
    setFieldErrors(result.errors);
    if (!result.valid) {
      // The per-row messages say what is wrong; a second general one would only
      // repeat them.
      clearError();
      return;
    }
    void run(result.chapters);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Chapters</p>
        <p className="text-xs text-fg-muted">
          Add chapter markers so viewers can jump to sections. Times must count up and stay before
          the video ends.
        </p>
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const startError = errorMap.get(errorKey(i, "start"));
            const titleError = errorMap.get(errorKey(i, "title"));
            const startErrId = `chapter-${row.id}-start-error`;
            const titleErrId = `chapter-${row.id}-title-error`;
            return (
              <li key={row.id} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1">
                    <input
                      aria-label={`Chapter ${i + 1} start`}
                      placeholder="0:00"
                      value={row.start}
                      inputMode="numeric"
                      maxLength={9}
                      onChange={(e) => updateRow(row.id, { start: e.target.value })}
                      aria-invalid={startError ? true : undefined}
                      aria-describedby={startError ? startErrId : undefined}
                      className={`w-24 tabular-nums ${FIELD}`}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <input
                      aria-label={`Chapter ${i + 1} title`}
                      placeholder="Chapter title"
                      value={row.title}
                      maxLength={MAX_TITLE_LENGTH}
                      onChange={(e) => updateRow(row.id, { title: e.target.value })}
                      aria-invalid={titleError ? true : undefined}
                      aria-describedby={titleError ? titleErrId : undefined}
                      className={`w-full ${FIELD}`}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove chapter ${i + 1}`}
                    onClick={() => removeRow(row.id)}
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger focus-ring"
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
                {startError ? (
                  <p id={startErrId} className="text-xs text-danger">
                    {startError}
                  </p>
                ) : null}
                {titleError ? (
                  <p id={titleErrId} className="text-xs text-danger">
                    {titleError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : loaded ? (
        <p className="text-xs text-fg-muted">No chapters yet.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addRow}
          disabled={rows.length >= MAX_CHAPTERS}
        >
          Add chapter
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save chapters"}
        </Button>
        {saved ? (
          <span role="status" className="text-xs text-success">
            Chapters saved.
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
