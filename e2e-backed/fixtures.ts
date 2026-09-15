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

// A tiny 4-second AV clip (64x64, 5fps H.264 + 16 kHz mono AAC), base64-encoded.
// Unlike SAMPLE_MP4_4S_BASE64 above, this one carries a real AUDIO TRACK, which
// the Whisper auto-caption flow needs: given a video-only clip the transcription
// job's first attempt fails at audio extraction and only the ~90s backoff retry
// recovers, blowing the test budget. With audio present the FIRST attempt
// transcribes and the caption track lands fast. Generated with:
//   ffmpeg -f lavfi -i testsrc=size=64x64:rate=5:duration=4 \
//          -f lavfi -i sine=frequency=440:duration=4 \
//          -c:v libx264 -pix_fmt yuv420p -profile:v baseline \
//          -c:a aac -b:a 24k -ac 1 -ar 16000 -shortest -movflags +faststart out.mp4
// Not PII and only ~18 KB, so it stays cheap to upload.
export const SAMPLE_AV_MP4_4S_BASE64 =
  "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";

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
 * Transfer the file bytes and fill the details while finalization waits for
 * Publish. This lets scheduling and privacy metadata reach the draft before
 * the asynchronous processing worker can publish it.
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
  await page.getByRole("button", { name: "Upload video" }).click();
  await page.getByLabel("Video file").setInputFiles({
    name: opts.name ?? "clip.mp4",
    mimeType: opts.mimeType ?? "video/mp4",
    buffer: opts.buffer,
  });
  await expect(page.getByText(
    "Upload ready — save your details with Publish to begin processing.",
  )).toBeVisible({ timeout: 60_000 });
  // The title prefilled from the filename on the (now-visible) details stage —
  // overwrite it with the caller's title.
  await page.getByLabel("Video title").fill(opts.title);
  if (opts.privacy) {
    await page.getByLabel("Privacy", { exact: true }).selectOption(opts.privacy);
  }
}

/** Save metadata and release processing; callers assert the final outcome. */
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
