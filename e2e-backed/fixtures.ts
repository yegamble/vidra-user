import { randomUUID } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

// A tiny (16x16, ~0.1s) valid H.264 mp4 generated with ffmpeg, base64-encoded.
// The e2e backend runs a real ffprobe that rejects non-video bytes, so seeding a
// *publishable* video needs real video data. This is a synthetic black-frame clip
// (not a committed binary, not PII) so the backed tests can publish a video via
// the API without depending on ffmpeg being installed on the runner.
export const TINY_MP4_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAuVtZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAAz//727L4FNhTIwQAAAAhBmiJsQr/+wAAAAAgBnkF5Cv/EgQAAA11tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAeAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACh3RyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAEAAAABAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAHgAAAQAAAEAAAAAAf9tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAADIAAAAIAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAGqbWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAABanN0YmwAAAC+c3RzZAAAAAAAAAABAAAArmF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAEAAQAEgAAABIAAAAAAAAAAEVTGF2YzYyLjI4LjEwMCBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA0YXZjQwFkAAr/4QAXZ2QACqzZXsBEAAADAAQAAAMAyDxIllgBAAZo6+PLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAvuIAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAMAAAIAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAoY3R0cwAAAAAAAAADAAAAAQAABAAAAAABAAAGAAAAAAEAAAIAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAADAAAAAQAAACBzdHN6AAAAAAAAAAAAAAADAAACxQAAAAwAAAAMAAAAFHN0Y28AAAAAAAAAAQAAADAAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYyLjEyLjEwMA==";

// A valid 1x1 PNG (generated with zlib/struct, ~70 bytes), base64-encoded, for
// avatar/banner uploads. The backend gates profile images by file extension, but
// a real PNG keeps the stored object servable/renderable end to end.
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwcHAAAAGEAMGDX2mUAAAAAElFTkSuQmCC";

// The backend base URL for direct API seeding (the UI runs at :3000). Defaults to
// the CI backend (:8080); set E2E_API_URL=http://localhost:8088 for local runs.
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080";

export function uniqueId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

// The deterministic test admin. The backend grants the admin role to the FIRST
// account on a fresh instance, so `ensureAdmin` must run before any other
// registration — the `backed-setup` Playwright project (a dependency of
// `backend-backed`) guarantees that. These are throwaway credentials for an
// ephemeral CI/dev database, never a real secret.
export const ADMIN_USERNAME = "e2eadmin";
export const ADMIN_EMAIL = "e2e-admin@example.test";
export const ADMIN_PASSWORD = "e2e-admin-supersecret";

/**
 * ensureAdmin registers the deterministic admin (idempotent: a 409 means it already
 * exists from a prior run, which is fine). Run once, first, by the setup project.
 * NOTE: locally this only yields an admin against a FRESH database — reset with
 * `docker compose --profile core down -v` if the dev DB already has other accounts.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<void> {
  await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username: ADMIN_USERNAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
}

// LIVE_INGEST_SECRET is the shared secret the backed backend is started with
// (frontend-e2e-backed.yml / local run) so a test can drive the media-server-facing
// live ingest hooks. Test-only value, not a real secret.
export const LIVE_INGEST_SECRET = "e2e-ingest-secret";

// liveIngest calls the media-server-facing live ingest hook (start|stop) with the
// ingest secret + a publisher's stream key. Returns the HTTP status.
export async function liveIngest(
  request: APIRequestContext,
  action: "start" | "stop",
  streamKey: string,
  secret = LIVE_INGEST_SECRET,
): Promise<number> {
  const res = await request.post(`${API_URL}/api/v1/live/ingest/${action}`, {
    headers: { "X-Ingest-Secret": secret },
    data: { stream_key: streamKey },
  });
  return res.status();
}

/** loginToken logs in with the given credentials and returns the access token. */
export async function loginToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  return ((await res.json()) as { token: string }).token;
}

/** liveStreams reads a channel's live streams via the API as the owner. */
export async function liveStreams(
  request: APIRequestContext,
  handle: string,
  token: string,
): Promise<Array<{ id: string; title: string; state: string }>> {
  const res = await request.get(`${API_URL}/api/v1/channels/${handle}/live`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as { live_streams: Array<{ id: string; title: string; state: string }> }
  ).live_streams;
}

/** adminToken logs in as the deterministic admin and returns its access token. */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return ((await res.json()) as { token: string }).token;
}

/** reportsQueue reads the admin moderation queue (newest first) as the given admin. */
export async function reportsQueue(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ reason: string; target_type: string; status: string }>> {
  const res = await request.get(`${API_URL}/api/v1/admin/reports?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as { reports: Array<{ reason: string; target_type: string; status: string }> }
  ).reports;
}

/**
 * seedPublishedChannel registers a fresh owner, creates a channel, and publishes
 * one public video in it via the API, returning the channel handle + display name
 * and the owner's access token (for seeding owner-authored data such as comments).
 */
export async function seedPublishedChannel(
  request: APIRequestContext,
): Promise<{ handle: string; displayName: string; videoId: string; videoTitle: string; token: string }> {
  const id = uniqueId();
  const handle = `ch${id}`;
  const displayName = `Channel ${id}`;
  const videoTitle = `Video ${id}`;

  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username: `owner${id}`, email: `e2e-owner-${id}@example.test`, password: "supersecret-e2e" },
  });
  const token = ((await reg.json()) as { token: string }).token;
  const auth = { Authorization: `Bearer ${token}` };

  await request.post(`${API_URL}/api/v1/channels`, {
    headers: auth,
    data: { handle, display_name: displayName },
  });
  const vid = await request.post(`${API_URL}/api/v1/channels/${handle}/videos`, {
    headers: auth,
    data: { title: videoTitle, privacy: "public" },
  });
  const videoId = ((await vid.json()) as { id: string }).id;
  await request.post(`${API_URL}/api/v1/videos/${videoId}/file`, {
    headers: auth,
    multipart: {
      file: { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from(TINY_MP4_BASE64, "base64") },
    },
  });

  return { handle, displayName, videoId, videoTitle, token };
}

/**
 * registerUser registers a fresh account via the API, returning its access token,
 * id, and username. Used to seed a target account for admin user-management tests.
 */
export async function registerUser(
  request: APIRequestContext,
  prefix = "usr",
): Promise<{ token: string; id: string; username: string; email: string }> {
  const id = uniqueId();
  const username = `${prefix}${id}`;
  const email = `e2e-${prefix}-${id}@example.test`;
  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username, email, password: "supersecret-e2e" },
  });
  const body = (await reg.json()) as { token: string; user: { id: string } };
  return { token: body.token, id: body.user.id, username, email };
}

/** adminUsers reads the admin users list (optionally filtered by q) as the admin. */
export async function adminUsers(
  request: APIRequestContext,
  token: string,
  q?: string,
): Promise<Array<{ id: string; username: string; role: string; is_active: boolean }>> {
  const url = new URL(`${API_URL}/api/v1/admin/users`);
  url.searchParams.set("limit", "100");
  if (q) url.searchParams.set("q", q);
  const res = await request.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      users: Array<{ id: string; username: string; role: string; is_active: boolean }>;
    }
  ).users;
}

/**
 * registrationRequests reads the admin registration approval queue as the given
 * admin (optionally only pending). Used to prove a signup filed a request and
 * that approve/reject persisted its status flip.
 */
export async function registrationRequests(
  request: APIRequestContext,
  token: string,
  status?: "pending",
): Promise<Array<{ id: string; username: string; email: string; status: string }>> {
  const url = new URL(`${API_URL}/api/v1/admin/registration-requests`);
  url.searchParams.set("limit", "100");
  if (status) url.searchParams.set("status", status);
  const res = await request.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      requests: Array<{ id: string; username: string; email: string; status: string }>;
    }
  ).requests;
}

/** loginStatus attempts a login and returns just the HTTP status (200 = account exists). */
export async function loginStatus(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<number> {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  return res.status();
}

/**
 * fileVideoReport registers a fresh reporter and files a report on a video via the
 * API, returning the unique reason used (so a test can find it in the queue). Used
 * to seed an open report for the moderation-resolve UI to act on.
 */
export async function fileVideoReport(
  request: APIRequestContext,
  videoId: string,
): Promise<string> {
  const id = uniqueId();
  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username: `rep${id}`, email: `e2e-rep-${id}@example.test`, password: "supersecret-e2e" },
  });
  const token = ((await reg.json()) as { token: string }).token;
  const reason = `mod-report-${id}`;
  await request.post(`${API_URL}/api/v1/videos/${videoId}/report`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { reason },
  });
  return reason;
}

/** blockVideo blocks a video as the given admin/moderator (POST /admin/videos/:id/block). */
export async function blockVideo(
  request: APIRequestContext,
  token: string,
  videoId: string,
  reason: string,
): Promise<void> {
  await request.post(`${API_URL}/api/v1/admin/videos/${videoId}/block`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { reason },
  });
}

/** blockedVideos reads the moderation block-list (newest block first) as the given admin. */
export async function blockedVideos(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ video_id: string; title: string; reason: string }>> {
  const res = await request.get(`${API_URL}/api/v1/admin/videos/blocked?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as { videos: Array<{ video_id: string; title: string; reason: string }> }
  ).videos;
}

/** videoIsPublic reports whether GET /videos/:id is publicly reachable (200 = visible). */
export async function videoIsPublic(request: APIRequestContext, videoId: string): Promise<boolean> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}`);
  return res.status() === 200;
}

/** captions reads a video's caption tracks via the public API. */
export async function captions(
  request: APIRequestContext,
  videoId: string,
): Promise<Array<{ language: string; label: string }>> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}/captions`);
  return ((await res.json()) as { captions: Array<{ language: string; label: string }> }).captions;
}

/** seedCaption uploads a WebVTT caption track to a video as its owner (multipart). */
export async function seedCaption(
  request: APIRequestContext,
  videoId: string,
  token: string,
  language: string,
  label: string,
): Promise<void> {
  await request.post(`${API_URL}/api/v1/videos/${videoId}/captions`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      language,
      label,
      file: {
        name: "cap.vtt",
        mimeType: "text/vtt",
        buffer: Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n"),
      },
    },
  });
}

/**
 * devEmailToken reads the most recent captured account-security token for an
 * email via the DEV-ONLY endpoint (requires DEV_MAIL_CAPTURE_ENABLED=true on the
 * backend). Lets the backed suite complete the reset / email-verify confirm flows
 * with the token the backend would otherwise only deliver out-of-band.
 */
export async function devEmailToken(
  request: APIRequestContext,
  email: string,
  kind: "reset" | "verification" = "reset",
): Promise<string> {
  const res = await request.get(
    `${API_URL}/api/v1/dev/email-token?email=${encodeURIComponent(email)}&kind=${kind}`,
  );
  return ((await res.json()) as { token: string }).token;
}

/** watchedWords reads the instance watched-words list as the given admin. */
export async function watchedWords(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ id: string; word: string }>> {
  const res = await request.get(`${API_URL}/api/v1/admin/watched-words?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { words: Array<{ id: string; word: string }> }).words;
}

/** seedComment posts a comment on a video as the given user, returning its id. */
export async function seedComment(
  request: APIRequestContext,
  videoId: string,
  token: string,
  body: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/videos/${videoId}/comments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { body },
  });
  return ((await res.json()) as { id: string }).id;
}

/** followerCount reads a channel's persisted follower count via the public API. */
export async function followerCount(request: APIRequestContext, handle: string): Promise<number> {
  const res = await request.get(`${API_URL}/api/v1/channels/${handle}`);
  return ((await res.json()) as { follower_count: number }).follower_count;
}

/**
 * channelDetail reads a channel via the public API, returning the HTTP status
 * alongside the mutable fields — so a caller can assert both an edit (200 with
 * new values) and a delete (404, channel gone).
 */
export async function channelDetail(
  request: APIRequestContext,
  handle: string,
): Promise<{ status: number; display_name?: string; description?: string }> {
  const res = await request.get(`${API_URL}/api/v1/channels/${handle}`);
  if (!res.ok()) return { status: res.status() };
  const body = (await res.json()) as { display_name: string; description: string };
  return { status: res.status(), display_name: body.display_name, description: body.description };
}

/** videoComments reads a video's persisted comments via the public API. */
export async function videoComments(
  request: APIRequestContext,
  videoId: string,
): Promise<Array<{ body: string; author_username: string; edited: boolean }>> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}/comments`);
  return (
    (await res.json()) as { comments: Array<{ body: string; author_username: string; edited: boolean }> }
  ).comments;
}

/** videoDetail reads a video's public detail (title/description/taxonomy/HLS) via the API. */
export async function videoDetail(
  request: APIRequestContext,
  videoId: string,
): Promise<{
  title: string;
  description: string;
  category?: string;
  language?: string;
  license?: string;
  tags?: string[];
  hls_url?: string;
  renditions?: Array<{ height: number; width: number }>;
}> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}`);
  return (await res.json()) as {
    title: string;
    description: string;
    category?: string;
    language?: string;
    license?: string;
    tags?: string[];
    hls_url?: string;
    renditions?: Array<{ height: number; width: number }>;
  };
}

/**
 * waitForHls polls a video's public detail until the transcoding pipeline has
 * published its HLS ladder (hls_url present), returning the detail. Requires
 * the backed stack to run with TRANSCODING_ENABLED=true (frontend-e2e-backed.yml
 * sets it); fails loudly after the deadline instead of passing on mocks.
 */
export async function waitForHls(
  request: APIRequestContext,
  videoId: string,
  timeoutMs = 90_000,
): Promise<Awaited<ReturnType<typeof videoDetail>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const detail = await videoDetail(request, videoId);
    if (detail.hls_url) return detail;
    if (Date.now() > deadline) {
      throw new Error(
        `video ${videoId} was not transcoded to HLS within ${timeoutMs}ms — ` +
          "is the backed stack running with TRANSCODING_ENABLED=true?",
      );
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

/**
 * channelVideos reads a channel's videos via the API. Unauthenticated it returns
 * only public, published videos; pass the owner's `token` to read every state
 * (e.g. to prove a failed upload persisted as state="failed").
 */
export async function channelVideos(
  request: APIRequestContext,
  handle: string,
  token?: string,
): Promise<Array<{ id: string; title: string; privacy: string; state: string }>> {
  const res = await request.get(`${API_URL}/api/v1/channels/${handle}/videos`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return (
    (await res.json()) as {
      videos: Array<{ id: string; title: string; privacy: string; state: string }>;
    }
  ).videos;
}

/**
 * sendDirectMessage starts (or reopens) the 1:1 conversation from sender → recipient
 * and posts one message, via the API as the sender. Returns the conversation id.
 * Used to seed a real message so the recipient's message-notification can be proven
 * in the UI.
 */
export async function sendDirectMessage(
  request: APIRequestContext,
  senderToken: string,
  recipientId: string,
  body: string,
): Promise<string> {
  const auth = { Authorization: `Bearer ${senderToken}` };
  const conv = await request.post(`${API_URL}/api/v1/conversations`, {
    headers: auth,
    data: { recipient_id: recipientId },
  });
  const conversationId = ((await conv.json()) as { id: string }).id;
  await request.post(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
    headers: auth,
    data: { body },
  });
  return conversationId;
}

/**
 * conversationsFor reads a user's direct-message inbox via the API (as that
 * user's token), returning the other participant and last-message preview per
 * conversation — so a test can prove a message persisted for BOTH participants.
 */
export async function conversationsFor(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ other_username: string; last_message_body: string }>> {
  const res = await request.get(`${API_URL}/api/v1/me/conversations?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      conversations: Array<{ other_username: string; last_message_body: string }>;
    }
  ).conversations;
}

/**
 * ownerVideoDetail reads a video's detail AS ITS OWNER (a non-published video —
 * draft/scheduled/quarantined/failed — is 404 to the public), returning the
 * status plus the lifecycle fields a scheduling/quarantine test asserts on.
 */
export async function ownerVideoDetail(
  request: APIRequestContext,
  videoId: string,
  token: string,
): Promise<{ status: number; state?: string; publish_at?: string }> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return { status: res.status() };
  const body = (await res.json()) as { state: string; publish_at?: string };
  return { status: res.status(), state: body.state, publish_at: body.publish_at };
}

/** notificationPrefs reads the caller's persisted notification switchboard via the API. */
export async function notificationPrefs(
  request: APIRequestContext,
  token: string,
): Promise<Record<string, boolean>> {
  const res = await request.get(`${API_URL}/api/v1/me/notification-prefs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { prefs: Record<string, boolean> }).prefs;
}

/** videoRating reads a video's persisted like/dislike counts via the public API. */
export async function videoRating(
  request: APIRequestContext,
  videoId: string,
): Promise<{ like_count: number; dislike_count: number }> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}/rating`);
  return (await res.json()) as { like_count: number; dislike_count: number };
}

/**
 * muteInstance mutes a federated instance for the given user via the API
 * (POST /me/mutes/instances/{domain}). Used to seed an instance mute — the UI
 * mute control lives on a remote video's watch page, which needs federated
 * content a plain backed stack does not have.
 */
export async function muteInstance(
  request: APIRequestContext,
  token: string,
  domain: string,
): Promise<number> {
  const res = await request.post(
    `${API_URL}/api/v1/me/mutes/instances/${encodeURIComponent(domain)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.status();
}

/** mutedInstances reads the caller's persisted instance mutes via the API. */
export async function mutedInstances(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ domain: string; muted_at: string }>> {
  const res = await request.get(`${API_URL}/api/v1/me/mutes/instances?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as { instances: Array<{ domain: string; muted_at: string }> }
  ).instances;
}
