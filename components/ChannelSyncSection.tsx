"use client";

import { useEffect, useState } from "react";

import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage, fieldErrors, getInstanceCached } from "@/lib/api";
import type { Channel, ChannelSync } from "@/lib/api";
import {
  channelSyncStateClass,
  channelSyncStateLabel,
  isChannelSyncDisabledError,
  validateChannelSyncUrl,
} from "@/lib/channel-sync";
import { relativeTime } from "@/lib/format";

// ChannelSyncSection — "Auto-import from another platform" (UPLOAD-13, backport
// W2.U5). Below the channel cards: a connect form (target channel + external
// channel URL) plus the caller's syncs, each with a state pill
// (waiting_first_run | syncing | idle | failed), last_sync_at, a safe last_error,
// and Sync now / Remove. The "disabled" empty state is driven two ways: proactively
// by the /instance features.channel_sync flag (config-parity W8/W15 — only an
// EXPLICIT false disables, so an older backend or a failed read keeps the shipped
// behavior), and reactively by the stable 503 the create / sync-now endpoints
// return when auto-sync is off (covers a flag change mid-session).

type Status = "loading" | "error" | "ready";

export function ChannelSyncSection({ channels }: { channels: Channel[] }) {
  const [status, setStatus] = useState<Status>("loading");
  const [syncs, setSyncs] = useState<ChannelSync[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // Feature-off: flipped true when a create / sync-now returns the stable 503, so
  // the connect form gives way to the honest disabled empty state (existing syncs
  // stay visible for management — Remove still works when it is off).
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listChannelSyncs(controller.signal)
      .then((res) => {
        setSyncs(res.channel_syncs);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Proactive feature flag: the operator turned channel auto-sync off, so the
  // connect form gives way to the honest disabled empty state up front instead
  // of 503ing on submit. Existing syncs stay visible for management.
  useEffect(() => {
    let cancelled = false;
    getInstanceCached()
      .then((instance) => {
        if (!cancelled && instance.features.channel_sync === false) setDisabled(true);
      })
      .catch(() => {
        // Unknown instance policy → keep the reactive-503 behavior only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read the whole list from the server (the source of truth) after a sync-now,
  // so any state change (e.g. → syncing) shows without guessing client-side.
  async function refetch() {
    try {
      const res = await api.listChannelSyncs();
      setSyncs(res.channel_syncs);
    } catch {
      // A refetch failure leaves the last known list — never a faked state.
    }
  }

  const channelName = (id: string) =>
    channels.find((c) => c.id === id)?.display_name ?? "your channel";

  return (
    <section aria-labelledby="channel-sync-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="channel-sync-heading" className="text-[15px] font-bold tracking-tight">
          Auto-import from another platform
        </h2>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Mirror another channel’s new uploads into one of yours. Imported videos arrive as
          private drafts for you to review and publish — nothing is auto-published.
        </p>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your auto-syncs" />
        </div>
      ) : status === "error" ? (
        <ErrorState
          message="Could not load your auto-syncs."
          onRetry={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      ) : (
        <>
          {syncs.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
              {syncs.map((s) => (
                <ChannelSyncRow
                  key={s.id}
                  sync={s}
                  channelName={channelName(s.channel_id)}
                  featureDisabled={disabled}
                  onRemoved={() => setSyncs((list) => list.filter((x) => x.id !== s.id))}
                  onDisabled={() => setDisabled(true)}
                  onSynced={() => void refetch()}
                />
              ))}
            </ul>
          ) : null}

          {disabled ? (
            // Auto-sync is turned off on this instance — an honest empty state,
            // never a dead connect form that would only 503 on submit.
            <EmptyState
              title="Auto-import is disabled on this instance"
              message="The operator has turned off cross-platform channel auto-sync here. Check back later, or upload and import videos directly."
            />
          ) : (
            <ConnectForm
              channels={channels}
              onCreated={(s) => setSyncs((list) => [s, ...list])}
              onDisabled={() => setDisabled(true)}
            />
          )}
        </>
      )}
    </section>
  );
}

function ConnectForm({
  channels,
  onCreated,
  onDisabled,
}: {
  channels: Channel[];
  onCreated: (sync: ChannelSync) => void;
  onDisabled: () => void;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const invalid = validateChannelSyncUrl(url);
    if (invalid) {
      setUrlError(invalid);
      return;
    }
    setUrlError(null);
    setBusy(true);
    try {
      const res = await api.createChannelSync({
        channel_id: channelId,
        external_channel_url: url.trim(),
      });
      onCreated(res.channel_sync);
      setUrl("");
    } catch (err) {
      if (isChannelSyncDisabledError(err)) {
        onDisabled();
        return;
      }
      // A 422's field error (malformed/non-public URL) reads under the URL field;
      // 409 is a duplicate; the per-user cap and everything else is a general error.
      const field = fieldErrors(err)?.external_channel_url;
      if (field) {
        setUrlError(field);
      } else {
        setError(
          errorMessage(err, "Could not connect that channel.", {
            "409": "You already have an auto-sync for that channel and URL.",
            "422": "That URL isn’t valid, or you’ve reached your auto-sync limit.",
            "404": "That channel no longer exists.",
          }),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-label="Connect an external channel"
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {channels.length > 1 ? (
          <div className="sm:w-56">
            <Select
              label="Import into"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="flex-1">
          <Input
            label="External channel URL"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) setUrlError(null);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text").trim();
              if (text !== "" && /^https?:\/\//i.test(text)) {
                e.preventDefault();
                setUrl(text);
                if (urlError) setUrlError(null);
              }
            }}
            placeholder="https://www.youtube.com/@example"
            error={urlError ?? undefined}
            hint="A public http(s) link to the channel to mirror. We fetch, scan, and stage each new upload as a private draft."
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || channelId === "" || url.trim() === ""}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </form>
  );
}

type RowPhase = "idle" | "syncing" | "removing";

function ChannelSyncRow({
  sync,
  channelName,
  featureDisabled,
  onRemoved,
  onDisabled,
  onSynced,
}: {
  sync: ChannelSync;
  channelName: string;
  featureDisabled: boolean;
  onRemoved: () => void;
  onDisabled: () => void;
  onSynced: () => void;
}) {
  const [phase, setPhase] = useState<RowPhase>("idle");
  const [scheduled, setScheduled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncNow() {
    if (phase !== "idle") return;
    setError(null);
    setPhase("syncing");
    try {
      await api.syncChannelNow(sync.id);
      // 202: scheduled for the next tick — not an immediate sync. Reflect any
      // server-side state change via a list refetch and confirm honestly.
      setScheduled(true);
      onSynced();
    } catch (err) {
      if (isChannelSyncDisabledError(err)) {
        onDisabled();
        return;
      }
      setError(errorMessage(err, "Could not schedule a sync."));
    } finally {
      setPhase("idle");
    }
  }

  async function remove() {
    if (phase !== "idle") return;
    setError(null);
    setPhase("removing");
    try {
      await api.deleteChannelSync(sync.id);
      onRemoved();
    } catch (err) {
      // A 404 means it is already gone — drop the row either way.
      if (err instanceof Object && "status" in err && (err as { status: number }).status === 404) {
        onRemoved();
        return;
      }
      setError(errorMessage(err, "Could not remove that sync."));
      setPhase("idle");
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg" title={sync.external_channel_url}>
            {sync.external_channel_url}
          </p>
          <p className="text-[13px] text-fg-muted">
            <span className="tabular-nums">
              {sync.last_sync_at ? `Last synced ${relativeTime(sync.last_sync_at)}` : "Never synced"}
            </span>{" "}
            · into {channelName}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${channelSyncStateClass(
            sync.state,
          )}`}
        >
          {channelSyncStateLabel(sync.state)}
        </span>
      </div>

      {sync.last_error ? (
        <p className="text-xs text-danger">{sync.last_error}</p>
      ) : null}
      {scheduled ? (
        <p role="status" className="text-xs text-fg-muted">
          Sync scheduled — it’ll run on the next pass.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {!featureDisabled ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Sync ${sync.external_channel_url} now`}
            disabled={phase !== "idle"}
            onClick={() => void syncNow()}
          >
            {phase === "syncing" ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderIcon size={16} className="animate-spin" />
                Scheduling…
              </span>
            ) : (
              "Sync now"
            )}
          </Button>
        ) : null}
        <Button
          variant="danger-outline"
          size="sm"
          aria-label={`Remove sync for ${sync.external_channel_url}`}
          disabled={phase !== "idle"}
          onClick={() => void remove()}
        >
          {phase === "removing" ? "Removing…" : "Remove"}
        </Button>
      </div>
    </li>
  );
}
