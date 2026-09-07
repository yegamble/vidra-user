import { ApiError } from "@/lib/api";
import type { ChannelSync, ChannelSyncState } from "@/lib/api";

// Channel auto-sync vocabulary (UPLOAD-13, backport W2.U5). Pure mappings of the
// backend's `channel_sync.state` (see vidra-core/api/openapi.yaml
// #/components/schemas/ChannelSync) onto the studio's status-pill vocabulary, plus
// the connect-form URL validation and the feature-off signal. Kept dependency-free
// (no React) so it is unit-tested directly.

// The state pill for one sync. `waiting_first_run` never synced (neutral/pending),
// `syncing` a run is in progress (accent/active), `idle` last run succeeded
// (success/healthy), `failed` last run errored (danger — see last_error).
export function channelSyncStateLabel(state: ChannelSyncState): string {
  switch (state) {
    case "syncing":
      return "Syncing";
    case "idle":
      return "Idle";
    case "failed":
      return "Failed";
    case "waiting_first_run":
    default:
      return "Waiting first run";
  }
}

// The token recipe (bg + text) for a state's status pill, reusing the studio
// StateBadge vocabulary exactly so the sync pills read identically to the video
// pills (and clear AA contrast — the generic Badge `danger` fill does not at this
// 10.5px size): waiting→muted-strong, syncing→warning (in progress),
// idle→success (healthy), failed→danger-surface.
export function channelSyncStateClass(state: ChannelSyncState): string {
  switch (state) {
    case "syncing":
      return "bg-warning/15 text-warning";
    case "idle":
      return "bg-success/15 text-success";
    case "failed":
      return "bg-danger-surface text-danger";
    case "waiting_first_run":
    default:
      return "bg-surface-strong text-fg-muted";
  }
}

// validateChannelSyncUrl trims the external channel URL and requires a public-ish
// http(s) URL BEFORE the network round-trip (the backend does the authoritative
// SSRF check; this is the honest inline guard so the form never posts an obviously
// bad value). Returns a field-error string, or null when the trimmed URL is OK.
export function validateChannelSyncUrl(raw: string): string | null {
  const url = raw.trim();
  if (url === "") return "Enter the channel URL to mirror.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Enter a valid http(s) URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http(s) URLs are supported.";
  }
  return null;
}

// isChannelSyncDisabledError recognises the backend's stable "auto-sync off"
// signal: the 503 `service_unavailable` the create / sync-now handlers return when
// CHANNEL_SYNC_ENABLED (or the yt-dlp import resolver it needs) is off. There is no
// proactive GET flag for this feature — the list endpoint always 200s — so this
// reactive signal at the contract boundary is what drives the honest disabled
// empty state.
export function isChannelSyncDisabledError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 503 || err.code === "service_unavailable");
}

// channelSyncBackoffNote is the one-line explanation of a FAILING sync: how many
// runs in a row have failed, and when the next attempt lands. The backend backs
// a failing sync off exponentially (vidra-core migration 0135: the nth
// consecutive failure retries after CHANNEL_SYNC_INTERVAL x 2^(n-1), capped at
// CHANNEL_SYNC_BACKOFF_MAX), so "Failed" on its own is no longer enough — the
// gap between attempts is now the thing the owner cannot guess, and it is what
// tells them whether Sync now is worth pressing.
//
// Returns null when there is nothing to explain: a healthy sync, or one whose run
// is in progress (while `syncing`, next_run_at is the worker's lease expiry, not
// a scheduled attempt — rendering it would be a lie). A missing/unparseable
// next_run_at degrades to the count alone rather than rendering "in NaN".
export function channelSyncBackoffNote(
  sync: Pick<ChannelSync, "state" | "failure_count" | "next_run_at">,
  now: Date = new Date(),
): string | null {
  const failures = sync.failure_count ?? 0;
  if (failures <= 0 || sync.state === "syncing") return null;
  const count = failures === 1 ? "1 failed run" : `${failures} failed runs in a row`;
  const at = sync.next_run_at ? new Date(sync.next_run_at).getTime() : Number.NaN;
  if (Number.isNaN(at)) return count;
  const secs = Math.floor((at - now.getTime()) / 1000);
  if (secs <= 0) return `${count} · next attempt due now`;
  return `${count} · next attempt in ${compactUntil(secs)}`;
}

// compactUntil renders a positive second count in the coarse units relativeTime
// uses for the past ("40m", "16h", "2d"), so a row's two time phrases read in one
// vocabulary.
//
// It ROUNDS where relativeTime floors, and the difference is load-bearing here: a
// scheduled moment is always read some time AFTER it was scheduled, so a 4h
// backoff has 3h59m left by the time the list is fetched — flooring would render
// every backoff one unit short and a 4h gap would never once say "4h".
function compactUntil(secs: number): string {
  if (secs < 60) return "under a minute";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(secs / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(secs / 86400)}d`;
}
