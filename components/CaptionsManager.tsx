"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { Caption, VideoConfigOption } from "@/lib/api";

// How often to poll an in-progress auto-caption job for its status.
const AUTO_POLL_MS = 2_000;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !file || language.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.uploadCaption(videoId, {
        language: language.trim(),
        label: label.trim() || undefined,
        file,
      });
      // Replace-or-add by language, keeping the list sorted.
      setCaptions((prev) =>
        sortByLanguage([...prev.filter((c) => c.language !== created.language), created]),
      );
      setLanguage("");
      setLabel("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError("The file must be WebVTT and the language a valid tag (e.g. en, pt-BR).");
      } else {
        setError(errorMessage(err, "Could not upload the caption."));
      }
    } finally {
      setBusy(false);
    }
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
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">Captions</p>

      {captions.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {captions.map((c) => (
            <li key={c.language} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{c.language}</span>
                {c.label ? <span className="text-zinc-500 dark:text-zinc-400"> · {c.label}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Remove ${c.language} caption`}
                onClick={() => void remove(c.language)}
                className="text-xs font-medium text-zinc-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No captions yet.</p>
      ) : null}

      <form className="flex flex-col gap-2" onSubmit={upload}>
        <div className="flex flex-wrap gap-2">
          {languages.length > 0 ? (
            <select
              aria-label="Caption language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
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
              className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
          <input
            aria-label="Caption label"
            placeholder="Label (optional)"
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            ref={fileRef}
            type="file"
            aria-label="Caption file"
            accept=".vtt,text/vtt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="submit"
            disabled={busy || !file || language.trim() === ""}
            className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </form>

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="text-sm font-medium">Generate automatically</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Transcribe this video&apos;s audio into a caption track automatically. Pick
          a language hint, or leave it on the default to let the server decide.
        </p>
        {autoState === "unsupported" ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
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
                className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              />
            )}
            <button
              type="button"
              onClick={() => void generateAuto()}
              disabled={autoBusy || autoState === "running"}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {autoState === "running" ? "Generating…" : "Generate automatically"}
            </button>
          </div>
        )}
        {autoState === "running" ? (
          <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
            Generating captions… this can take a few minutes. You&apos;ll be notified
            when they&apos;re ready.
          </p>
        ) : null}
        {autoState === "done" ? (
          <p role="status" className="text-xs text-green-600 dark:text-green-400">
            Automatic captions added.
          </p>
        ) : null}
        {autoState === "failed" && autoError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{autoError}</p>
        ) : null}
        {autoState !== "failed" && autoError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{autoError}</p>
        ) : null}
      </div>
    </div>
  );
}
