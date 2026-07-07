"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
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
  const [replayEnabled, setReplayEnabled] = useState(false);
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
        replay_enabled: replayEnabled,
      });
      setStreams((prev) => [res.live_stream, ...prev]);
      setRevealed({ id: res.live_stream.id, key: res.stream_key, rtmp: res.rtmp_url });
      setTitle("");
      setPermanent(false);
      setReplayEnabled(false);
    } catch (err) {
      setError(errorMessage(err, "Could not create the live stream."));
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

  // Toggle "save replay as a video" on an existing stream. The update contract is
  // a full-object edit (title required), so the stream's current fields ride
  // along unchanged; only replay_enabled flips. On success the returned stream
  // replaces the row (never touches the key or live state).
  async function toggleReplay(stream: LiveStream) {
    const next = !stream.replay_enabled;
    try {
      const updated = await api.updateLiveStream(stream.id, {
        title: stream.title,
        description: stream.description,
        privacy: stream.privacy,
        permanent: stream.permanent,
        replay_enabled: next,
      });
      setStreams((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // Leave the toggle as-is on failure.
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Live streams</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        >
          Reload
        </Button>
      </div>

      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-4"
      >
        {channels.length > 1 ? (
          <Select
            label="Channel"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            aria-label="Live channel"
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.handle}>
                {ch.display_name} (@{ch.handle})
              </option>
            ))}
          </Select>
        ) : null}
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My live show"
          aria-label="Live stream title"
          maxLength={200}
        />
        <Select
          label="Privacy"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value as VideoPrivacy)}
          aria-label="Live privacy"
        >
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="private">Private</option>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(e) => setPermanent(e.target.checked)}
            aria-label="Permanent live stream"
            className="h-4 w-4 rounded border-border accent-accent focus-ring"
          />
          Permanent (reuse this stream + key across sessions)
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={replayEnabled}
              onChange={(e) => setReplayEnabled(e.target.checked)}
              aria-label="Save replay as a video"
              className="h-4 w-4 rounded border-border accent-accent focus-ring"
            />
            Save replay as a video
          </span>
          <span className="pl-6 text-xs text-fg-muted">
            Records this stream and publishes it as a normal video (with the same
            privacy) once the stream ends.
          </span>
        </label>
        <div>
          <Button type="submit" disabled={busy || title.trim() === ""}>
            {busy ? "Creating…" : "Create live stream"}
          </Button>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
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
        <p className="text-sm text-fg-muted">No live streams yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {streams.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.title}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <LiveStateBadge state={s.state} />
                  <span className="text-fg-muted">{s.privacy}</span>
                  {s.permanent ? (
                    <span className="text-fg-muted">· permanent</span>
                  ) : null}
                </div>
                <label className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={s.replay_enabled}
                    onChange={() => void toggleReplay(s)}
                    aria-label={`Save replay as a video for ${s.title}`}
                    className="h-3.5 w-3.5 rounded border-border accent-accent focus-ring"
                  />
                  Save replay as a video
                </label>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => void regenerate(s.id)}
                  className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg focus-ring"
                >
                  Regenerate key
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s.id)}
                  className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger focus-ring"
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
    offline: "bg-surface-strong text-fg-muted",
    live: "bg-danger/15 text-danger",
    ended: "bg-surface-strong text-fg-muted",
  };
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] " +
        styles[state]
      }
    >
      {state === "live" ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-live animate-[live-pulse_1.6s_infinite]"
        />
      ) : null}
      {state}
    </span>
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
      className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4 text-sm"
    >
      <p className="flex items-start gap-2.5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="mt-0.5 h-4 w-4 flex-none text-warning"
        >
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        <span className="font-semibold text-fg">
          Copy your stream key now — it won&apos;t be shown again.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={revealed.key}
          aria-label="Stream key"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[13px] text-fg focus-ring"
        />
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {revealed.rtmp ? (
        <p className="text-[13px] text-fg-muted">
          RTMP URL: <span className="font-mono text-fg">{revealed.rtmp}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="self-start rounded-full text-xs font-semibold text-fg-muted underline transition-colors hover:text-fg hover:no-underline focus-ring"
      >
        Dismiss
      </button>
    </div>
  );
}
