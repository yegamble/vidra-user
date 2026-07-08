"use client";

import { useEffect, useState } from "react";

import { CheckIcon, CopyIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/api";
import type { Channel, CreateLiveStreamRequest, LiveStream } from "@/lib/api";
import { cn } from "@/lib/cn";

// Live streams accept only public/unlisted/private (the create contract has no
// "password" mode, unlike VOD videos) — narrow to exactly what the endpoint takes.
type LivePrivacy = NonNullable<CreateLiveStreamRequest["privacy"]>;

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
  const [privacy, setPrivacy] = useState<LivePrivacy>("public");
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
          onChange={(e) => setPrivacy(e.target.value as LivePrivacy)}
          aria-label="Live privacy"
        >
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="private">Private</option>
        </Select>
        {/* The design's Go-live create form: Permanent + Save-replay as toggle
            switches in an iOS-style divider list (no card border of their own). */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle py-3.5">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-fg">Permanent stream</p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                Reuse the same stream and key between sessions
              </p>
            </div>
            <Toggle checked={permanent} onChange={setPermanent} label="Permanent stream" />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle py-3.5">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-fg">Save replay</p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                Publish the recording as a video (same privacy) after the stream ends
              </p>
            </div>
            <Toggle
              checked={replayEnabled}
              onChange={setReplayEnabled}
              label="Save replay as a video"
            />
          </div>
        </div>
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

// CopyIconButton — a small icon-only copy affordance (design vocabulary) that
// flips to a check with an SR-announced "Copied" for a moment. Copies the real
// value regardless of the field's blur state.
function CopyIconButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable; the value is selectable in the field regardless.
    }
  }

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={() => void copy()}
      className="focus-ring flex shrink-0 items-center text-fg-muted transition-colors hover:text-fg"
    >
      {copied ? <CheckIcon size={15} className="text-success" /> : <CopyIcon size={15} />}
    </button>
  );
}

// StreamKeyReveal is the design's Go-live one-time key screen. The key is shown
// exactly once (server keeps only its hash), so this surface leads with the
// warning, then the RTMP server + stream key as mono fields with copy buttons
// and a Show/Hide blur toggle, and closes on an "encoder waiting" hint. Rotate /
// Delete are the stream row's affordances (regenerate = POST /live/{id}/key);
// this panel just Dismisses once the key is copied.
function StreamKeyReveal({ revealed, onDismiss }: { revealed: RevealedKey; onDismiss: () => void }) {
  // Default shown (keyShown in the design) — the whole point is "copy it now";
  // Hide blurs it as a shoulder-surfing guard.
  const [hidden, setHidden] = useState(false);

  return (
    <div role="status" className="flex flex-col gap-3.5">
      <div className="flex items-start gap-2.5 rounded-2xl bg-surface-muted p-4 text-[13px] leading-relaxed text-fg-muted">
        <WarningIcon size={15} className="mt-0.5 shrink-0 text-warning" />
        <span>
          <span className="font-semibold text-fg">Your stream key is shown only once.</span> Copy
          it into your encoder now — you can rotate it later, but not view it again.
        </span>
      </div>

      {revealed.rtmp ? (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-fg">RTMP server</p>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-fg">
              {revealed.rtmp}
            </span>
            <CopyIconButton value={revealed.rtmp} label="Copy RTMP server URL" />
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-fg">Stream key</p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5">
          <input
            readOnly
            value={revealed.key}
            aria-label="Stream key"
            className={cn(
              "min-w-0 flex-1 bg-transparent font-mono text-[13.5px] text-fg focus-ring",
              hidden && "select-none blur-[5px]",
            )}
          />
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-pressed={hidden}
            className="focus-ring shrink-0 text-[12.5px] font-semibold text-fg-muted transition-colors hover:text-fg"
          >
            {hidden ? "Show" : "Hide"}
          </button>
          <CopyIconButton value={revealed.key} label="Copy key" />
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl bg-surface-muted px-4 py-3.5">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-fg-subtle" />
        <span className="text-[13.5px] text-fg-muted">
          Waiting for encoder… start streaming to go live
        </span>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="focus-ring self-start rounded-full text-xs font-semibold text-fg-muted underline transition-colors hover:text-fg hover:no-underline"
      >
        Dismiss
      </button>
    </div>
  );
}
