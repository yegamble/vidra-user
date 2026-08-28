"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage, getInstanceCached } from "@/lib/api";
import type { Caption, VideoConfigOption } from "@/lib/api";
import { useAsyncAction } from "@/lib/use-async-action";

// How often to poll an in-progress auto-caption job for its status.
const AUTO_POLL_MS = 2_000;

// Shared token recipes for the compact inline controls in this panel.
const FIELD =
  "rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";

function sortByLanguage(list: Caption[]): Caption[] {
  return [...list].sort((a, b) => a.language.localeCompare(b.language));
}

// CaptionsManager lists a video's WebVTT caption tracks and lets the owner upload
// (or replace) and remove them. Embedded in the studio's per-video edit surface.
export function CaptionsManager({ videoId }: { videoId: string }) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [languages, setLanguages] = useState<VideoConfigOption[]>([]);
  const [language, setLanguage] = useState("");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { run, busy, error } = useAsyncAction(
    async (chosen: File) => {
      const created = await api.uploadCaption(videoId, {
        language: language.trim(),
        label: label.trim() || undefined,
        file: chosen,
      });
      // Replace-or-add by language, keeping the list sorted.
      setCaptions((prev) =>
        sortByLanguage([...prev.filter((c) => c.language !== created.language), created]),
      );
      setLanguage("");
      setLabel("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    "Could not upload the caption.",
    (err) =>
      err instanceof ApiError && err.status === 422
        ? "The file must be WebVTT and the language a valid tag (e.g. en, pt-BR)."
        : null,
  );

  // Whisper auto-caption state. "idle" until requested; "running" while a job is
  // pending/running (drives polling); "done"/"failed" are terminal; "unsupported"
  // is discovered when the server answers 503 (auto-captioning disabled) and
  // disables the control with an explanation.
  const [autoLang, setAutoLang] = useState("");
  const [autoState, setAutoState] = useState<
    "idle" | "running" | "done" | "failed" | "unsupported"
  >("idle");
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getCaptions(videoId, controller.signal)
      .then((res) => {
        setCaptions(res.captions);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [videoId]);

  // Load the caption-language taxonomy so the owner picks from curated codes
  // (same source as the studio metadata dropdowns) instead of free-typing a tag.
  // On failure we leave the list empty and fall back to a free-text input.
  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoConfig(controller.signal)
      .then((res) => setLanguages(res.languages))
      .catch(() => {
        // Keep the free-text fallback; no user-facing error for a config miss.
      });
    return () => controller.abort();
  }, []);

  // Proactive feature flag (config-parity W8/W15): /instance features.transcription
  // is false while Whisper auto-captioning is unavailable (toggle off, or no
  // endpoint wired), so the control renders the honest "unavailable" explanation
  // up front instead of 503ing on use. Only an EXPLICIT false disables — an older
  // backend or a failed read keeps the shipped reactive-503 behavior. Never
  // downgrades a job already in flight.
  useEffect(() => {
    let cancelled = false;
    getInstanceCached()
      .then((instance) => {
        if (cancelled || instance.features.transcription !== false) return;
        setAutoState((prev) => (prev === "idle" ? "unsupported" : prev));
      })
      .catch(() => {
        // Unknown instance policy → keep the reactive-503 behavior only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function upload(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !file || language.trim() === "") return;
    void run(file);
  }

  async function remove(lang: string) {
    try {
      await api.deleteCaption(videoId, lang);
      setCaptions((prev) => prev.filter((c) => c.language !== lang));
    } catch {
      // Leave the caption in place on failure.
    }
  }

  // Request a Whisper auto-caption job. 503 → the instance doesn't support it
  // (disable the control, explain); 409 → a job is already running (just start
  // polling); 422 → the language hint is malformed. On enqueue we move to
  // "running", which starts the status poll below.
  async function generateAuto() {
    if (autoBusy || autoState === "running") return;
    setAutoBusy(true);
    setAutoError(null);
    try {
      await api.requestAutoCaption(videoId, autoLang.trim() ? { language: autoLang.trim() } : {});
      setAutoState("running");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setAutoState("unsupported");
      } else if (err instanceof ApiError && err.status === 409) {
        // A job is already in flight for this video — follow it to completion.
        setAutoState("running");
      } else if (err instanceof ApiError && err.status === 422) {
        setAutoError("That language tag is not valid (try e.g. en or pt-BR).");
      } else {
        setAutoError(errorMessage(err, "Could not start auto-captioning."));
      }
    } finally {
      setAutoBusy(false);
    }
  }

  // Poll the job while it is running. On "done" the generated track is stored via
  // the same path as a manual upload, so we refresh the list to reveal it; on
  // "failed" we surface the job's safe error. Cleanup aborts in-flight polls and
  // stops the interval when the job settles or the component unmounts.
  useEffect(() => {
    if (autoState !== "running") return;
    const controller = new AbortController();
    let stopped = false;

    async function poll() {
      try {
        const { caption_job } = await api.getAutoCaption(videoId, controller.signal);
        if (stopped) return;
        if (caption_job.state === "done") {
          // Refresh the list BEFORE flipping to "done": marking the job done
          // re-runs this effect and aborts `controller`, so fetch the new track
          // while the signal is still live, then settle the terminal state.
          const list = await api.getCaptions(videoId, controller.signal);
          if (stopped) return;
          setCaptions(sortByLanguage(list.captions));
          setAutoState("done");
        } else if (caption_job.state === "failed") {
          setAutoError(caption_job.error ?? "Auto-captioning failed. Try again.");
          setAutoState("failed");
        }
      } catch {
        // Transient poll failure (or aborted): keep waiting until settled/unmount.
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), AUTO_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [autoState, videoId]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <p className="text-sm font-semibold">Captions</p>

      {captions.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {captions.map((c) => (
            <li key={c.language} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-semibold">{c.language}</span>
                {c.label ? <span className="text-fg-muted"> · {c.label}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Remove ${c.language} caption`}
                onClick={() => void remove(c.language)}
                className="rounded-full px-2.5 py-1 text-xs font-semibold text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger focus-ring"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-xs text-fg-muted">No captions yet.</p>
      ) : null}

      <form className="flex flex-col gap-2" onSubmit={upload}>
        <div className="flex flex-wrap items-center gap-2">
          {languages.length > 0 ? (
            <select
              aria-label="Caption language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={`w-40 ${FIELD}`}
            >
              <option value="">Select a language…</option>
              {languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Caption language"
              placeholder="Language (e.g. en)"
              value={language}
              maxLength={35}
              onChange={(e) => setLanguage(e.target.value)}
              className={`w-28 ${FIELD}`}
            />
          )}
          <input
            aria-label="Caption label"
            placeholder="Label (optional)"
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            className={`w-40 ${FIELD}`}
          />
          <input
            ref={fileRef}
            type="file"
            aria-label="Caption file"
            accept=".vtt,text/vtt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm focus-ring file:mr-3 file:rounded-full file:border-0 file:bg-surface-muted file:px-3.5 file:py-1.5 file:text-sm file:font-semibold file:text-fg"
          />
          <Button type="submit" size="sm" disabled={busy || !file || language.trim() === ""}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </form>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
        <p className="text-sm font-semibold">Generate automatically</p>
        <p className="text-xs text-fg-muted">
          Transcribe this video&apos;s audio into a caption track automatically. Pick
          a language hint, or leave it on the default to let the server decide.
        </p>
        {autoState === "unsupported" ? (
          <p className="text-xs text-fg-muted">
            Automatic captions aren&apos;t available on this server.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {languages.length > 0 ? (
              <select
                aria-label="Transcription language"
                value={autoLang}
                onChange={(e) => setAutoLang(e.target.value)}
                disabled={autoState === "running"}
                className={`w-40 ${FIELD}`}
              >
                <option value="">Default language</option>
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label="Transcription language"
                placeholder="Language hint (optional)"
                value={autoLang}
                maxLength={35}
                onChange={(e) => setAutoLang(e.target.value)}
                disabled={autoState === "running"}
                className={`w-40 ${FIELD}`}
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void generateAuto()}
              disabled={autoBusy || autoState === "running"}
            >
              {autoState === "running" ? "Generating…" : "Generate automatically"}
            </Button>
          </div>
        )}
        {autoState === "running" ? (
          <p role="status" className="text-xs text-fg-muted">
            Generating captions… this can take a few minutes. You&apos;ll be notified
            when they&apos;re ready.
          </p>
        ) : null}
        {autoState === "done" ? (
          <p role="status" className="text-xs text-success">
            Automatic captions added.
          </p>
        ) : null}
        {autoState === "failed" && autoError ? (
          <p className="text-xs text-danger">{autoError}</p>
        ) : null}
        {autoState !== "failed" && autoError ? (
          <p className="text-xs text-danger">{autoError}</p>
        ) : null}
      </div>
    </div>
  );
}
