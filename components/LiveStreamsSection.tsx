"use client";

import { useEffect, useState } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { Channel, LiveStream, VideoPrivacy } from "@/lib/api";

type Status = "loading" | "error" | "ready";

// A revealed stream key, shown exactly once (after create or regenerate) — it is
// never refetched, so once dismissed it's gone.
type RevealedKey = { id: string; key: string; rtmp?: string };

// LiveStreamsSection lets a channel owner create live streams and manage their
// stream keys. The key is shown once on create/regenerate (copy-it-now), then
// only its hash lives server-side. RTMP ingestion is a later boundary — streams
// start "offline".
export function LiveStreamsSection({ channels }: { channels: Channel[] }) {
  const [handle, setHandle] = useState(channels[0]?.handle ?? "");
  const [status, setStatus] = useState<Status>("loading");
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [title, setTitle] = useState("");
  const [privacy, setPrivacy] = useState<VideoPrivacy>("public");
  const [permanent, setPermanent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);

  useEffect(() => {
    if (handle === "") return;
    const controller = new AbortController();
    api
      .getLiveStreams(handle, controller.signal)
      .then((res) => {
        setStreams(res.live_streams);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [handle, reloadKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || title.trim() === "" || handle === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createLiveStream(handle, {
        title: title.trim(),
        privacy,
        permanent,
      });
      setStreams((prev) => [res.live_stream, ...prev]);
      setRevealed({ id: res.live_stream.id, key: res.stream_key, rtmp: res.rtmp_url });
      setTitle("");
      setPermanent(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the live stream.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(id: string) {
    try {
      const res = await api.regenerateLiveStreamKey(id);
      setRevealed({ id, key: res.stream_key, rtmp: res.rtmp_url });
    } catch {
      // Leave the stream as-is on failure.
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteLiveStream(id);
      setStreams((prev) => prev.filter((s) => s.id !== id));
      setRevealed((r) => (r?.id === id ? null : r));
    } catch {
      // Leave the stream in place on failure.
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Live streams</h2>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Reload
        </button>
      </div>

      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        {channels.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Channel</span>
            <select
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-label="Live channel"
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
            placeholder="My live show"
            aria-label="Live stream title"
            maxLength={200}
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Privacy</span>
          <select
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
            aria-label="Live privacy"
            className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(e) => setPermanent(e.target.checked)}
            aria-label="Permanent live stream"
          />
          Permanent (reuse this stream + key across sessions)
        </label>
        <div>
          <button
            type="submit"
            disabled={busy || title.trim() === ""}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Creating…" : "Create live stream"}
          </button>
        </div>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </form>

      {revealed ? <StreamKeyReveal revealed={revealed} onDismiss={() => setRevealed(null)} /> : null}

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading live streams" />
        </div>
      ) : status === "error" ? (
        <ErrorState
          message="Could not load your live streams."
          onRetry={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      ) : streams.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No live streams yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {streams.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <LiveStateBadge state={s.state} />
                  <span className="text-zinc-500 dark:text-zinc-400">{s.privacy}</span>
                  {s.permanent ? (
                    <span className="text-zinc-500 dark:text-zinc-400">· permanent</span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => void regenerate(s.id)}
                  className="font-medium text-zinc-600 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  Regenerate key
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s.id)}
                  className="font-medium text-zinc-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiveStateBadge({ state }: { state: LiveStream["state"] }) {
  const styles: Record<LiveStream["state"], string> = {
    offline: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    live: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    ended: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span className={"rounded px-1.5 py-0.5 font-medium " + styles[state]}>{state}</span>
  );
}

function StreamKeyReveal({ revealed, onDismiss }: { revealed: RevealedKey; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(revealed.key);
      setCopied(true);
    } catch {
      // Clipboard may be unavailable; the key is selectable in the field regardless.
    }
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-950/30"
    >
      <p className="font-medium text-amber-800 dark:text-amber-200">
        Copy your stream key now — it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={revealed.key}
          aria-label="Stream key"
          className="min-w-0 flex-1 rounded border border-amber-300 bg-white px-2 py-1 font-mono text-xs dark:border-amber-800/60 dark:bg-zinc-900"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800/60 dark:text-amber-200"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {revealed.rtmp ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          RTMP URL: <span className="font-mono">{revealed.rtmp}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="self-start text-xs font-medium text-amber-700 underline hover:no-underline dark:text-amber-300"
      >
        Dismiss
      </button>
    </div>
  );
}
