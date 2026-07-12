// Remote-URI search support (config-parity W13). The backend resolves a URI-
// or handle-shaped search query ("https://…", "@user@host", "user@host") to
// remote content — gated per auth state by search_remote_uri_users /
// search_remote_uri_anonymous — and rides the typed hits on the search
// response's additive `remote` array. This module owns the client-side half:
// tolerant narrowing of that additive field (absent on older backends and in
// the mocked e2e suite), the mapping of a remote-video hit onto the Video card
// shape SearchResultRow already renders, and the query-shape check the help
// text uses.
//
// NOTE: the `remote` field is typed by hand here rather than through
// lib/api/generated.ts — regenerating that file is deferred until the wave's
// backend contract lands upstream; the defensive reader keeps this correct
// either way.

import type { RemoteVideo, Video } from "@/lib/api";
import { parseRemoteFollowTarget } from "@/lib/remote-follow";

/** A resolved remote channel/account: the followable identity. */
export interface RemoteSearchActor {
  actor_url: string;
  /** name@domain */
  handle: string;
  domain: string;
}

/** One typed remote search hit (exactly one of video/actor per type). */
export type RemoteSearchResult =
  | { type: "video"; video: RemoteVideo }
  | { type: "channel"; actor: RemoteSearchActor }
  | { type: "account"; actor: RemoteSearchActor };

/** The two effective gates from GET /instance `search{}` (absent = off). */
export interface InstanceSearchBlock {
  remote_uri_users?: boolean;
  remote_uri_anonymous?: boolean;
}

function isActor(v: unknown): v is RemoteSearchActor {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.actor_url === "string" &&
    typeof a.handle === "string" &&
    typeof a.domain === "string"
  );
}

function isRemoteVideo(v: unknown): v is RemoteVideo {
  if (typeof v !== "object" || v === null) return false;
  const rv = v as Record<string, unknown>;
  return typeof rv.id === "string" && typeof rv.title === "string" && rv.remote === true;
}

/**
 * readRemoteSearchResults narrows a search response's additive `remote` array,
 * dropping anything malformed. Tolerates the field being absent entirely
 * (older backend, gates off, mocked e2e) — the caller then renders local-only
 * results exactly as before this wave.
 */
export function readRemoteSearchResults(res: unknown): RemoteSearchResult[] {
  if (typeof res !== "object" || res === null) return [];
  const raw = (res as { remote?: unknown }).remote;
  if (!Array.isArray(raw)) return [];
  const out: RemoteSearchResult[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const it = item as { type?: unknown; video?: unknown; actor?: unknown };
    if (it.type === "video" && isRemoteVideo(it.video)) {
      out.push({ type: "video", video: it.video });
    } else if ((it.type === "channel" || it.type === "account") && isActor(it.actor)) {
      out.push({ type: it.type, actor: it.actor });
    }
  }
  return out;
}

/**
 * remoteVideoToCard maps a resolved remote-video hit onto the Video card shape
 * the search rows already render (the same remote:true treatment cached remote
 * videos get in the regular results list).
 */
export function remoteVideoToCard(rv: RemoteVideo): Video {
  return {
    id: rv.id,
    remote: true,
    domain: rv.domain,
    title: rv.title,
    description: rv.description,
    created_at: rv.published_at ?? "",
    duration_seconds: rv.duration_seconds,
    has_thumbnail: rv.has_thumbnail,
    watch_url: rv.watch_url,
    stream_url: rv.stream_url,
  } as Video;
}

/**
 * searchQueryLooksRemote reports whether a query is URL- or handle-shaped —
 * the shapes the backend resolves remotely. Reuses the remote-follow form's
 * parser so the two surfaces agree on what a handle looks like.
 */
export function searchQueryLooksRemote(query: string): boolean {
  return parseRemoteFollowTarget(query) !== null;
}
