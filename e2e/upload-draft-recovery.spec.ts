import { expect, test, type Page } from "@playwright/test";

// Mocked coverage for server-side draft recovery (W2.U1 / UPLOAD-02/03): the
// studio reads GET /api/v1/me/uploads and renders a "Resume an upload" card for
// each unfinished resumable session; re-picking the file resumes it (missing
// chunks only), a different file is rejected by identity, and Discard cancels the
// session server-side. The real DB round-trip is proven in
// e2e-backed/upload-draft-recovery.spec.ts.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const ME_UPLOADS = /\/api\/v1\/me\/uploads(\?|$)/;
const SESSION = /\/api\/v1\/uploads\/up1$/;
const CHUNK = /\/api\/v1\/uploads\/up1\/chunks\/\d+$/;
const COMPLETE = /\/api\/v1\/uploads\/up1\/complete$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;

const FUTURE = new Date(Date.now() + 23 * 3600 * 1000).toISOString();

function channel() {
  return {
    id: "c1",
    owner_id: "u1",
    handle: "ada_makes",
    display_name: "Ada Makes",
    description: "",
    follower_count: 0,
    created_at: new Date().toISOString(),
  };
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    channel_id: "c1",
    title: "My clip",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// One active resumable session as GET /me/uploads returns it (received chunk
// COUNT, opaque fingerprint). Empty fingerprint ⇒ the card verifies a re-pick by
// name+size; a non-empty one is compared against the re-picked file's fingerprint.
function activeUpload(overrides: Record<string, unknown> = {}) {
  return {
    upload_id: "up1",
    video_id: "v1",
    filename: "clip.mp4",
    size: 10,
    chunk_size: 4,
    total_chunks: 3,
    received_chunks: 1,
    file_fingerprint: "",
    expires_at: FUTURE,
    ...overrides,
  };
}

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "Ada",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

async function studioBase(page: Page) {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
}

test("the studio lists an unfinished upload from the server as a recovery card", async ({ page }) => {
  await studioBase(page);
  await page.route(ME_UPLOADS, (route) => route.fulfill({ json: { uploads: [activeUpload()] } }));

  await page.getByRole("link", { name: "Studio" }).click();

  const card = page.getByRole("region", { name: "Unfinished uploads" });
  await expect(card.getByText("Resume an upload")).toBeVisible();
  const row = card.getByRole("listitem").filter({ hasText: "clip.mp4" });
  await expect(row).toBeVisible();
  // 4 of 10 bytes landed (1 chunk of 4) and the 23h TTL countdown renders.
  await expect(row.getByText("4 B of 10 B")).toBeVisible();
  await expect(row.getByText(/expires in \d+h/)).toBeVisible();
  await expect(row.getByRole("button", { name: "Resume clip.mp4" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Discard clip.mp4" })).toBeVisible();
});

test("re-picking the file resumes the upload, sending only the missing chunks", async ({ page }) => {
  await studioBase(page);
  await page.route(ME_UPLOADS, (route) => route.fulfill({ json: { uploads: [activeUpload()] } }));
  // GET the session status → active, chunk 0 already received (of 3). The same
  // endpoint is the finalisation poll once the completion is accepted (202), so
  // it reports "completed" from that point on.
  let completionAccepted = false;
  await page.route(SESSION, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: {
            upload_id: "up1",
            video_id: "v1",
            state: completionAccepted ? "completed" : "active",
            size: 10,
            chunk_size: 4,
            total_chunks: 3,
            received_chunks: completionAccepted ? [0, 1, 2] : [0],
            bytes_received: completionAccepted ? 10 : 4,
            expires_at: FUTURE,
            failure_reason: "",
          },
        })
      : route.continue(),
  );
  const putChunks: number[] = [];
  await page.route(CHUNK, (route) => {
    const n = Number(/\/chunks\/(\d+)$/.exec(route.request().url())![1]);
    putChunks.push(n);
    return route.fulfill({
      status: 200,
      json: {
        upload_id: "up1",
        video_id: "v1",
        state: "active",
        size: 10,
        chunk_size: 4,
        total_chunks: 3,
        received_chunks: [...new Set([0, ...putChunks])].sort((a, b) => a - b),
        bytes_received: n === 2 ? 10 : (n + 1) * 4,
        expires_at: FUTURE,
      },
    });
  });
  await page.route(COMPLETE, (route) => {
    completionAccepted = true;
    return route.fulfill({
      status: 202,
      json: {
        upload_id: "up1",
        video_id: "v1",
        state: "queued",
        size: 10,
        chunk_size: 4,
        total_chunks: 3,
        received_chunks: [0, 1, 2],
        bytes_received: 10,
        expires_at: FUTURE,
        failure_reason: "",
      },
    });
  });
  await page.route(VIDEO, (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: video() }) : route.fallback(),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "clip.mp4" });
  // Re-pick the same 10-byte clip.mp4 (name+size match — the session carries no
  // fingerprint) directly onto the row's hidden input.
  await row.locator('input[type="file"]').setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(10),
  });

  await expect(page.getByText("Upload finished.")).toBeVisible();
  await expect(page.getByRole("link", { name: /View .*My clip/ })).toBeVisible();
  // Only the missing chunks (1 and 2) were PUT — chunk 0 was skipped.
  expect(putChunks.sort((a, b) => a - b)).toEqual([1, 2]);
});

test("re-picking a different file is rejected by identity, not resumed", async ({ page }) => {
  await studioBase(page);
  // The session carries a fingerprint, so a re-picked file whose content differs
  // fails the identity check before any session/chunk call is made.
  await page.route(ME_UPLOADS, (route) =>
    route.fulfill({ json: { uploads: [activeUpload({ file_fingerprint: "deadbeef".repeat(8) })] } }),
  );
  let sessionRead = false;
  await page.route(SESSION, (route) => {
    sessionRead = true;
    return route.continue();
  });

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "clip.mp4" });
  await row.locator('input[type="file"]').setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("a different clip entirely"),
  });

  await expect(row.getByText(/That’s a different file/)).toBeVisible();
  await expect(page.getByText("Upload finished.")).toHaveCount(0);
  expect(sessionRead).toBe(false);
});

test("Discard cancels the session server-side and removes the row", async ({ page }) => {
  await studioBase(page);
  await page.route(ME_UPLOADS, (route) => route.fulfill({ json: { uploads: [activeUpload()] } }));
  let sessionDeleted = false;
  await page.route(SESSION, (route) => {
    if (route.request().method() === "DELETE") {
      sessionDeleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
  await page.route(VIDEO, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 204, body: "" })
      : route.continue(),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "clip.mp4" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Discard clip.mp4" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: "clip.mp4" })).toHaveCount(0);
  await expect.poll(() => sessionDeleted).toBe(true);
  // The whole card disappears once its last session is discarded.
  await expect(page.getByRole("region", { name: "Unfinished uploads" })).toHaveCount(0);
});
