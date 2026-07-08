import { ApiError } from "@/lib/api";
import type { ChannelSyncState } from "@/lib/api";

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
