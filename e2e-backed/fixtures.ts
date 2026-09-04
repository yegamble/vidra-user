import { createHmac, randomUUID } from "node:crypto";

import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

// A small 4-second (16x16, 5fps) valid H.264 MP4, base64-encoded. It is long
// enough for both the thumbnail frame-picker and the HLS-to-progressive remux:
// the old ~0.1s fixture produced a segment that FFmpeg could not reliably
// probe, leaving failed transcode jobs ahead of the HLS tests. This synthetic
// gray-frame clip is not PII and is only ~2 KB, so it remains cheap to upload.
export const SAMPLE_MP4_4S_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAQhbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAD6AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAA0t0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAD6AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAA+gAAAQAAABAAAAAALDbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAoABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACbm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAi5zdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADACg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAeOAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAUAAAIAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAqGN0dHMAAAAAAAAAEwAAAAEAABAAAAAAAQAAKAAAAAABAAAQAAAAAAEAAAAAAAAAAQAACAAAAAABAAAoAAAAAAEAABAAAAAAAQAAAAAAAAABAAAIAAAAAAEAACgAAAAAAQAAEAAAAAABAAAAAAAAAAEAAAgAAAAAAQAAKAAAAAABAAAQAAAAAAEAAAAAAAAAAQAACAAAAAABAAAgAAAAAAIAAAgAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAUAAAAAQAAAGRzdHN6AAAAAAAAAAAAAAAUAAACwwAAAAwAAAAMAAAADAAAAAwAAAASAAAADgAAAAwAAAAMAAAAEgAAAA4AAAAMAAAADAAAABIAAAAOAAAADAAAAAwAAAASAAAADgAAAAwAAAAUc3RjbwAAAAAAAAABAAAEUQAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjIuMTIuMTAwAAAACGZyZWUAAAPPbWRhdAAAAq0GBf//qdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjUgcjMyMjIgYjM1NjA1YSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjUgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj01IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAADmWIhAAU//73x0/AnthhAAAACEGaJGxBP/7gAAAACEGeQniCH6uBAAAACAGeYXRD/7OAAAAACAGeY2pD/7OBAAAADkGaaEmoQWiZTAgn//7hAAAACkGehkURLBD/q4EAAAAIAZ6ldEP/s4EAAAAIAZ6nakP/s4AAAAAOQZqsSahBbJlMCCf//uAAAAAKQZ7KRRUsEP+rgQAAAAgBnul0Q/+zgAAAAAgBnutqQ/+zgAAAAA5BmvBJqEFsmUwIJf/+4QAAAApBnw5FFSwQ/6uBAAAACAGfLXRD/7OBAAAACAGfL2pD/7OAAAAADkGbM0moQWyZTAh///7gAAAACkGfUUUVLBD/q4EAAAAIAZ9yakP/s4A=";

// Most backed specs only need a tiny valid upload. Keep their existing import
// name while using the transcode-safe sample so parallel tests cannot poison
// the shared worker queue with permanently failing sub-second jobs.
export const TINY_MP4_BASE64 = SAMPLE_MP4_4S_BASE64;

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

// The deterministic test admin. `ensureAdmin` bootstraps it before any other
// backed test registers a user — the `backed-setup` Playwright project (a
// dependency of `backend-backed`) guarantees that. These are throwaway
// credentials for an ephemeral CI/dev database, never a real secret.
export const ADMIN_USERNAME = "e2eadmin";
export const ADMIN_EMAIL = "e2e-admin@example.test";
export const ADMIN_PASSWORD = "e2e-admin-supersecret";

// OWNER_CLAIM_TOKEN is the fixed first-run owner-claim token the backed backend
// is started with (frontend-e2e-backed.yml / the local recipe in .ralph/AGENT.md
// must boot the api with OWNER_CLAIM_TOKEN set to exactly this value). Since the
// owner-claim bootstrap, a fresh core grants admin ONLY by redeeming this token
// at POST /api/v1/setup/claim-owner — every registration answers 403
// owner_claim_required until then. Test-only value (the backend enforces >=16
// characters and refuses the variable outright in production), never a real secret.
export const OWNER_CLAIM_TOKEN = "e2e-owner-claim-token-not-secret";

/**
 * ensureAdmin bootstraps the deterministic admin against BOTH core generations
 * (CI checks out vidra-core@main, so the harness must not assume the owner-claim
 * feature has merged):
 *
 *  - New core (owner-claim bootstrap): redeem the fixed OWNER_CLAIM_TOKEN at
 *    POST /api/v1/setup/claim-owner — the claimed owner IS the deterministic
 *    admin. A 403 (`owner_claim_invalid`) means the instance is already claimed
 *    (a reused local DB from a prior run): fall through — the register below
 *    answers 409 for the already-existing admin, which is fine.
 *  - Old core (the endpoint 404s): fall back to the legacy register-first flow —
 *    that backend grants admin to the FIRST account on a fresh instance
 *    (register is idempotent here too: a 409 means a prior run created it).
 *
 * Run once, first, by the setup project. NOTE: locally this only yields an admin
 * against a FRESH database — reset with `docker compose --profile core down -v`
 * if the dev DB already has other accounts.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<void> {
  const claim = await request.post(`${API_URL}/api/v1/setup/claim-owner`, {
    data: {
      token: OWNER_CLAIM_TOKEN,
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });
  if (claim.ok()) return; // 201 — the claimed owner IS the admin account.
  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username: ADMIN_USERNAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (reg.status() === 403) {
    // New core, still unclaimed, and the fixed token was not accepted: the stack
    // was booted without OWNER_CLAIM_TOKEN (or with a different value), so NO
    // account can register until the boot-logged token is redeemed. Fail loudly
    // with the fix instead of letting every admin-gated spec time out later.
    throw new Error(
      "ensureAdmin: registration answered 403 (owner_claim_required) and the fixed " +
        "owner-claim token was not accepted — boot the backed stack with " +
        "OWNER_CLAIM_TOKEN matching e2e-backed/fixtures.ts (see .ralph/AGENT.md).",
    );
  }
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

/**
 * createChannelViaStudioUI creates the signed-in user's first channel through
 * the redesigned tabbed studio: Studio (dashboard) → Channel tab → the
 * "Create your first channel" form → then over to the Content tab, where the
 * upload sheet ("Upload video") and the "Your videos" list live. The old
 * single-page choreography (fill "Channel handle" right on the studio landing)
 * predates the tabbed IA and no longer matches the UI.
 */
export async function createChannelViaStudioUI(
  page: Page,
  handle: string,
  displayName: string,
): Promise<void> {
  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByRole("link", { name: "Channel", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(displayName);
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await created;
  // Uploads + the video list live on the Content tab.
  await page.getByRole("link", { name: "Content", exact: true }).click();
}

/**
 * startStudioUpload opens the "Upload video" sheet, selects the file (which
 * AUTO-STARTS the resumable upload — create session → PUT chunks → complete —
 * the instant a single file is chosen), and fills the title on the details
 * stage. Publish then only applies the metadata.
 *
 * Completion is ASYNCHRONOUS: the `complete` POST answers 202 ("accepted") and a
 * background worker assembles and processes the file, so the POST returning is
 * no longer the signal that a finished video exists. This waits for the POST and
 * then for the file card's "Uploaded" state, which is the client's own report
 * that the session finished — the deterministic point at which a caller may
 * Publish and expect an immediate outcome.
 */
export async function startStudioUpload(
  page: Page,
  opts: {
    title: string;
    name?: string;
    buffer: Buffer;
    mimeType?: string;
    /**
     * Explicit Privacy selection on the details step. The form PREFILLS from the
     * instance defaults.publish block (the compose default is "private"), so a
     * spec that later asserts PUBLIC visibility must select "public" here — the
     * untouched form would publish a private video.
     */
    privacy?: "public" | "unlisted" | "private";
  },
): Promise<void> {
  const uploaded = page.waitForResponse(
    (r) =>
      /\/uploads\/[^/]+\/complete$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Upload video" }).click();
  await page.getByLabel("Video file").setInputFiles({
    name: opts.name ?? "clip.mp4",
    mimeType: opts.mimeType ?? "video/mp4",
    buffer: opts.buffer,
  });
  await uploaded;
  // 202 only means the work was queued. Wait for the client to report the
  // session finished (the file card flips from "Processing…" to "Uploaded").
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible({ timeout: 60_000 });
  // The title prefilled from the filename on the (now-visible) details stage —
  // overwrite it with the caller's title.
  await page.getByLabel("Video title").fill(opts.title);
  if (opts.privacy) {
    await page.getByLabel("Privacy", { exact: true }).selectOption(opts.privacy);
  }
}

/**
 * publishViaStudioUI clicks the studio Publish button and waits for the metadata
 * PATCH that applies it. In the auto-start flow the file upload already finished
 * (startStudioUpload waited for the "Uploaded" state), so Publish just PATCHes
 * the form and derives the outcome. Works for both immediate and scheduled publishes (the
 * outcome differs; the PATCH is the shared signal).
 */
export async function publishViaStudioUI(page: Page): Promise<void> {
  const patched = page.waitForResponse(
    (r) =>
      /\/api\/v1\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await patched;
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

/**
 * loginTokenByIdentifier logs in through the `identifier` field, which accepts
 * an email OR a username. Returns "" when the login was refused, so callers can
 * assert on a refusal instead of blowing up on a missing token.
 */
export async function loginTokenByIdentifier(
  request: APIRequestContext,
  identifier: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { identifier, password },
  });
  if (!res.ok()) return "";
  return ((await res.json()) as { token?: string }).token ?? "";
}

/** liveStreams reads a channel's live streams via the API as the owner. */
export async function liveStreams(
  request: APIRequestContext,
  handle: string,
  token: string,
): Promise<Array<{ id: string; title: string; state: string; replay_enabled: boolean }>> {
  const res = await request.get(`${API_URL}/api/v1/channels/${handle}/live`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      live_streams: Array<{ id: string; title: string; state: string; replay_enabled: boolean }>;
    }
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

/** videoChapters reads a video's persisted seek-bar chapters via the API (CORE-15). */
export async function videoChapters(
  request: APIRequestContext,
  videoId: string,
  token?: string,
): Promise<Array<{ start_seconds: number; title: string }>> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}/chapters`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return (
    (await res.json()) as { chapters: Array<{ start_seconds: number; title: string }> }
  ).chapters;
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

/**
 * videoComments reads a video's persisted comments via the public API. It
 * surfaces `id` and `parent_id` (null for a top-level comment) so a caller can
 * prove threading — that a reply was persisted pointing at its parent.
 */
export async function videoComments(
  request: APIRequestContext,
  videoId: string,
): Promise<
  Array<{ id: string; parent_id: string | null; body: string; author_username: string; edited: boolean }>
> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}/comments`);
  return (
    (await res.json()) as {
      comments: Array<{
        id: string;
        parent_id: string | null;
        body: string;
        author_username: string;
        edited: boolean;
      }>;
    }
  ).comments;
}

/**
 * VideoDetail is the subset of GET /api/v1/videos/{id} the backed suite reads.
 *
 * `ipfs` is the DETAIL view's pinned-mirror signal: core emits a CID only for a
 * public+published video whose ledger row is state='pinned' on the PUBLIC swarm
 * (vidra-core internal/ipfsmirror/service.go VideoPins). `ipfs_pinned` is a
 * CARD/FEED field (openapi: "Drives the IPFS thumbnail badge on card/feed
 * views") and the detail handler never sets it — it is typed here only so a spec
 * can say so out loud rather than accidentally depending on it.
 */
type VideoDetail = {
  title: string;
  description: string;
  category?: string;
  language?: string;
  license?: string;
  tags?: string[];
  hls_url?: string;
  renditions?: Array<{ height: number; width: number }>;
  packaging_format?: "hls-ts" | "cmaf";
  dash_url?: string;
  ipfs_pinned?: boolean;
  ipfs?: { original_cid?: string; hls_cid?: string; gateway_url?: string };
};

/** videoDetail reads a video's public detail (title/description/taxonomy/HLS) via the API. */
export async function videoDetail(
  request: APIRequestContext,
  videoId: string,
): Promise<VideoDetail> {
  const res = await request.get(`${API_URL}/api/v1/videos/${videoId}`);
  return (await res.json()) as VideoDetail;
}

/**
 * waitForPublished polls a video's public detail until state === "published".
 * With TRANSCODING_ENABLED=true a fresh upload sits in the shared worker queue
 * (processing → transcoding → published), which under a full-suite run can take
 * tens of seconds — seedPublishedChannel returns as soon as the file is
 * uploaded, NOT when the video is live. Callers that need the video publicly
 * resolvable (e.g. the featured banner's server-side gate) must wait on this
 * first, or a "not published yet" read can get data-cached and outlive the
 * caller's own polling budget.
 */
export async function waitForPublished(
  request: APIRequestContext,
  videoId: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request.get(`${API_URL}/api/v1/videos/${videoId}`);
    if (res.ok()) {
      const detail = (await res.json()) as { state?: string };
      if (detail.state === "published") return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `video ${videoId} did not reach state "published" within ${timeoutMs}ms — ` +
          "shared transcode queue backlog, or the pipeline failed?",
      );
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
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
 * waitForIpfsPin polls a video's public detail until the IPFS mirror has pinned
 * its HLS tree — i.e. the detail carries `ipfs.hls_cid` + `ipfs.gateway_url`,
 * which is what the watch page's IPFS source bar is built from. Returns the
 * detail. Requires the backed stack to run with IPFS_ENABLED=true AND
 * TRANSCODING_ENABLED=true (the ipfs-backed job in frontend-e2e-backed.yml sets
 * both); fails loudly after the deadline instead of passing on mocks.
 *
 * Call it AFTER waitForHls: the HLS pin is armed by the transcode-completion
 * hook (vidra-core internal/ipfsmirror/service.go OnTranscodeComplete), so there
 * is nothing to wait for until the ladder exists.
 *
 * Budget: pinning is asynchronous and un-leadered — the drain worker ticks every
 * 10s after a randomised start (vidra-core cmd/api/main.go runIPFSMirrorWorker),
 * and each pass adds+pins at most 8 rows, of which one video contributes five
 * (original, hls, thumbnail, storyboard, storyboard_vtt). Under a shared queue
 * that is several ticks, hence the generous default.
 */
export async function waitForIpfsPin(
  request: APIRequestContext,
  videoId: string,
  timeoutMs = 120_000,
): Promise<Awaited<ReturnType<typeof videoDetail>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const detail = await videoDetail(request, videoId);
    if (detail.ipfs?.hls_cid && detail.ipfs.gateway_url) return detail;
    if (Date.now() > deadline) {
      throw new Error(
        `video ${videoId} was not IPFS-pinned within ${timeoutMs}ms (ipfs=${JSON.stringify(
          detail.ipfs ?? null,
        )}) — is the backed stack running with IPFS_ENABLED=true and a reachable kubo node?`,
      );
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** One media class's pin tally from GET /api/v1/ipfs/status (schema IPFSClassPinCounts). */
export type IpfsClassCounts = {
  media_class: string;
  pinned: number;
  pending: number;
  failed: number;
  unpinned: number;
};

/** The subset of GET /api/v1/ipfs/status (schema IPFSStatus) the backed suite reads. */
export type IpfsStatus = {
  enabled: boolean;
  node_reachable: boolean;
  gateway_url: string;
  pins: { pinned: number; pending: number; failed: number; unpinned: number };
  by_class: IpfsClassCounts[];
  networks: {
    public: { enabled: boolean; by_class: IpfsClassCounts[] };
    private: { enabled: boolean; by_class: IpfsClassCounts[] };
  };
};

/**
 * ipfsStatus reads the admin IPFS mirror status (GET /api/v1/ipfs/status,
 * admin-only) — whether the mirror is on, the node is reachable, and the pin
 * tally overall + per media class. `by_class` is a GROUP BY over the pin ledger,
 * so a class appears there only once a row exists for it: an ABSENT class is
 * proof nothing of that kind was ever enqueued.
 */
export async function ipfsStatus(
  request: APIRequestContext,
  token: string,
): Promise<IpfsStatus> {
  const res = await request.get(`${API_URL}/api/v1/ipfs/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`GET /ipfs/status answered ${res.status()}: ${await res.text()}`);
  }
  return (await res.json()) as IpfsStatus;
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

// A DM attachment's metadata as carried on a message read from the API.
interface DMAttachmentRow {
  id: string;
  kind: string;
  content_type: string;
  filename: string;
  size_bytes: number;
}

/**
 * inboxFor reads a user's DM inbox via the API (as that user's token), returning
 * the id, the other participant, the last-message preview AND the unread count
 * per conversation — so a read-receipt test can prove the unread count dropped
 * to zero after the thread was opened.
 */
export async function inboxFor(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ id: string; other_username: string; last_message_body: string; unread_count?: number }>> {
  const res = await request.get(`${API_URL}/api/v1/me/conversations?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      conversations: Array<{
        id: string;
        other_username: string;
        last_message_body: string;
        unread_count?: number;
      }>;
    }
  ).conversations;
}

/**
 * conversationMessages reads a plaintext conversation's messages AS a
 * participant, returning each message (with any attachments) plus the peer's
 * read watermark (peer_last_read_message_id) — so a backed test can prove an
 * attachment persisted for the OTHER participant, or that a read receipt landed.
 */
export async function conversationMessages(
  request: APIRequestContext,
  token: string,
  conversationId: string,
): Promise<{
  messages: Array<{ id: string; body: string; deleted?: boolean; attachments?: DMAttachmentRow[] }>;
  peer_last_read_message_id?: string;
}> {
  const res = await request.get(
    `${API_URL}/api/v1/conversations/${conversationId}/messages?limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return (await res.json()) as {
    messages: Array<{ id: string; body: string; deleted?: boolean; attachments?: DMAttachmentRow[] }>;
    peer_last_read_message_id?: string;
  };
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

/** playerSettings reads the caller's persisted player settings via the API. */
export async function playerSettings(
  request: APIRequestContext,
  token: string,
): Promise<{
  autoplay_next: boolean;
  default_speed: number;
  default_quality: string;
  captions_default: boolean;
  theater_default: boolean;
}> {
  const res = await request.get(`${API_URL}/api/v1/me/player-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await res.json()) as {
    autoplay_next: boolean;
    default_speed: number;
    default_quality: string;
    captions_default: boolean;
    theater_default: boolean;
  };
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

// --- TOTP (RFC 6238) test-side implementation --------------------------------
// The backed MFA spec enrolls through the UI and must then COMPUTE valid
// authenticator codes from the enrolled base32 secret, exactly like a real
// authenticator app would (SHA1, 6 digits, 30s period — the backend's stated
// parameters). Test-code only; the product never computes TOTP codes.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** base32Decode decodes an (unpadded) RFC 4648 base32 string. */
export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * totpCode computes the RFC 6238 code (HMAC-SHA1, 6 digits, 30s period) for a
 * base32 secret. `stepOffset` shifts the time window (the backend tolerates
 * ±1 step of skew, so ±1 is always accepted around "now").
 */
export function totpCode(secret: string, stepOffset = 0, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

// --- E2EE backed helpers -----------------------------------------------------

/** e2eeDevices reads a user's public E2EE devices via the API (as a participant/self). */
export async function e2eeDevices(
  request: APIRequestContext,
  userId: string,
  token: string,
): Promise<Array<{ id: string; identity_key: string; signing_key: string; device_name: string }>> {
  const res = await request.get(`${API_URL}/api/v1/users/${userId}/e2ee/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      devices: Array<{ id: string; identity_key: string; signing_key: string; device_name: string }>;
    }
  ).devices;
}

/** myE2EEDevices reads the caller's own registered devices via the API. */
export async function myE2EEDevices(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ id: string; device_name: string }>> {
  const res = await request.get(`${API_URL}/api/v1/e2ee/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { devices: Array<{ id: string; device_name: string }> }).devices;
}

/**
 * encryptedEnvelopes reads a conversation's stored envelopes AS the given
 * participant (their devices' envelopes only). Returns the ciphertext blobs so a
 * test can prove the server holds ONLY opaque ciphertext (never the plaintext).
 */
export async function encryptedEnvelopes(
  request: APIRequestContext,
  conversationId: string,
  token: string,
): Promise<Array<{ id: string; ciphertext: string; recipient_device_id: string; expires_at?: string }>> {
  const res = await request.get(
    `${API_URL}/api/v1/conversations/${conversationId}/messages?limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return (
    (await res.json()) as {
      envelopes: Array<{ id: string; ciphertext: string; recipient_device_id: string; expires_at?: string }>;
    }
  ).envelopes;
}

/** messagesStatus returns the HTTP status of reading a conversation's messages as the given token (404 = non-participant). */
export async function messagesStatus(
  request: APIRequestContext,
  conversationId: string,
  token: string,
): Promise<number> {
  const res = await request.get(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status();
}

/**
 * postEncryptedEnvelope posts one opaque ciphertext envelope to an encrypted
 * conversation AS the sender, optionally with a disappearing timer. Used to seed
 * an expiring envelope (the UI timer's floor is 1h, so a short-TTL expiry test
 * seeds directly). The ciphertext is an arbitrary opaque string — the server
 * never inspects it.
 */
export async function postEncryptedEnvelope(
  request: APIRequestContext,
  conversationId: string,
  token: string,
  input: { senderDeviceId: string; recipientDeviceId: string; ciphertext: string; expiresInSeconds?: number },
): Promise<number> {
  const res = await request.post(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      sender_device_id: input.senderDeviceId,
      envelopes: [
        { recipient_device_id: input.recipientDeviceId, message_type: 1, ciphertext: input.ciphertext },
      ],
      ...(input.expiresInSeconds ? { expires_in_seconds: input.expiresInSeconds } : {}),
    },
  });
  return res.status();
}

/** meId reads the caller's own account id via GET /auth/me. */
export async function meId(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { id: string }).id;
}

/** createChannel creates a channel for the given owner via the API (POST /channels). */
export async function createChannel(
  request: APIRequestContext,
  token: string,
  handle: string,
  displayName: string,
): Promise<void> {
  await request.post(`${API_URL}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { handle, display_name: displayName },
  });
}

/**
 * channelSyncs reads the caller's channel auto-syncs via the API (UPLOAD-13) —
 * the DB source of truth a backed test asserts on after a create/delete through
 * the UI. Each row carries its state + external URL.
 */
export async function channelSyncs(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ id: string; channel_id: string; external_channel_url: string; state: string }>> {
  const res = await request.get(`${API_URL}/api/v1/channel-syncs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      channel_syncs: Array<{
        id: string;
        channel_id: string;
        external_channel_url: string;
        state: string;
      }>;
    }
  ).channel_syncs;
}

type DonationAddressRow = {
  id: string;
  network: string;
  address: string;
  label: string;
  verified: boolean;
  channel_id?: string;
};

/** myDonationAddresses reads the caller's persisted donation addresses via the API. */
export async function myDonationAddresses(
  request: APIRequestContext,
  token: string,
): Promise<DonationAddressRow[]> {
  const res = await request.get(`${API_URL}/api/v1/me/donation-addresses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { addresses: DonationAddressRow[] }).addresses;
}

/** channelDonationAddresses reads a channel's PUBLIC donation addresses via the API. */
export async function channelDonationAddresses(
  request: APIRequestContext,
  handle: string,
): Promise<DonationAddressRow[]> {
  const res = await request.get(`${API_URL}/api/v1/channels/${handle}/donation-addresses`);
  return ((await res.json()) as { addresses: DonationAddressRow[] }).addresses;
}

/** userDonationAddresses reads a user's PUBLIC account-level donation addresses via the API. */
export async function userDonationAddresses(
  request: APIRequestContext,
  userId: string,
): Promise<DonationAddressRow[]> {
  const res = await request.get(`${API_URL}/api/v1/users/${userId}/donation-addresses`);
  return ((await res.json()) as { addresses: DonationAddressRow[] }).addresses;
}

/** instanceAbout reads the PUBLIC instance about/config document (GET /instance). */
export async function instanceAbout(
  request: APIRequestContext,
): Promise<{
  name: string;
  description: string;
  registration_enabled: boolean;
  terms_url: string;
  contact_email: string;
}> {
  const res = await request.get(`${API_URL}/api/v1/instance`);
  return (await res.json()) as {
    name: string;
    description: string;
    registration_enabled: boolean;
    terms_url: string;
    contact_email: string;
  };
}

/**
 * instanceSettings reads the effective admin instance-settings overlay as the
 * given admin (GET /admin/instance-settings), returned as a key→setting map so a
 * test can assert a specific key's effective value + whether it is DB-overridden.
 */
export async function instanceSettings(
  request: APIRequestContext,
  token: string,
): Promise<Record<string, { value: string | boolean; default: string | boolean; overridden: boolean }>> {
  const res = await request.get(`${API_URL}/api/v1/admin/instance-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    settings: Array<{ key: string; value: string | boolean; default: string | boolean; overridden: boolean }>;
  };
  const map: Record<string, { value: string | boolean; default: string | boolean; overridden: boolean }> = {};
  for (const s of body.settings) {
    map[s.key] = { value: s.value, default: s.default, overridden: s.overridden };
  }
  return map;
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

/**
 * blockedInstances reads the admin instance blocklist as a moderator/admin.
 * The list endpoint pages at 20 by default, so ask for the max — a backed run
 * shares one database with every other blocklist assertion in the suite.
 */
export async function blockedInstances(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ domain: string; reason: string; blocked_at: string }>> {
  const res = await request.get(`${API_URL}/api/v1/admin/instances/blocked?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (
    (await res.json()) as {
      instances: Array<{ domain: string; reason: string; blocked_at: string }>;
    }
  ).instances;
}

/**
 * flagVideoSensitive sets the owner's sensitive flag (and the paired
 * content-warning text) on a video via PATCH /videos/{id}. Seeded through the
 * API rather than the studio UI because the studio round trip is already
 * covered by studio.spec.ts — here the flag is the PRECONDITION, not the
 * subject. Returns the HTTP status.
 */
export async function flagVideoSensitive(
  request: APIRequestContext,
  token: string,
  videoId: string,
  reason: string,
): Promise<number> {
  const res = await request.patch(`${API_URL}/api/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { is_sensitive: true, sensitive_reason: reason },
  });
  return res.status();
}

/**
 * setSensitivePolicy writes the caller's per-user sensitive-content override
 * (PATCH /auth/me). Pass "" to clear it back to inheriting the instance policy.
 * Only "hide" is enforced server-side (flagged videos drop out of THIS user's
 * feed/search); warn/blur/display are presentation the frontend applies.
 * Returns the HTTP status.
 */
export async function setSensitivePolicy(
  request: APIRequestContext,
  token: string,
  policy: "hide" | "warn" | "blur" | "display" | "",
): Promise<number> {
  const res = await request.patch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { sensitive_content_policy: policy },
  });
  return res.status();
}

/**
 * searchVideoTitles reads the public video search as the given viewer (omit the
 * token for an anonymous read), returning the matched titles. The sensitive
 * "hide" policy is applied PER VIEWER inside core here, so the same query
 * answers differently for two callers — which is exactly what the backed
 * sensitive-content spec needs as database-side evidence.
 */
export async function searchVideoTitles(
  request: APIRequestContext,
  query: string,
  token?: string,
): Promise<string[]> {
  const res = await request.get(
    `${API_URL}/api/v1/videos/search?q=${encodeURIComponent(query)}&limit=100`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  return ((await res.json()) as { videos: Array<{ title: string }> }).videos.map((v) => v.title);
}
