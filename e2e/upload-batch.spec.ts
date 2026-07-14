import { expect, test, type Page } from "@playwright/test";

// Mocked coverage for batch upload (W2.U4 / UPLOAD-10): picking more than one
// video file switches the studio to the batch queue — one row per file with a
// filename-derived title, an independent progress line, a status pill, and
// cancel/retry per row. Uploads run at most 2 at a time (bounded parallelism); the
// rest wait as "Queued". The real 3-videos-after-refetch DB round-trip is proven
// in e2e-backed/upload-batch.spec.ts.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const ME_QUOTA = /\/api\/v1\/me\/quota$/;
const ME_UPLOADS = /\/api\/v1\/me\/uploads(\?|$)/;
const INSTANCE = /\/api\/v1\/instance$/;
const CHANNEL_LIVE = /\/api\/v1\/channels\/ada_makes\/live$/;
// Per-video resumable endpoints, keyed by the draft id the create POST returns.
const UPLOAD_SESSION = /\/api\/v1\/videos\/(bv\d+)\/upload-session$/;
const CHUNK = /\/api\/v1\/uploads\/up-(bv\d+)\/chunks\/\d+$/;
const COMPLETE = /\/api\/v1\/uploads\/up-(bv\d+)\/complete$/;

const FUTURE = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

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

function publishedVideo(id: string) {
  return {
    id,
    channel_id: "c1",
    title: `Clip ${id}`,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
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

// wireStudio sets up the studio shell + the batch resumable-upload mocks. The
// create-draft POST hands out incrementing ids (bv1, bv2, …); each id's
// session/chunk/complete round-trip then fulfils so the row finalises published.
async function wireStudio(page: Page, opts: { quota?: unknown } = {}) {
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.route(ME_UPLOADS, (route) => route.fulfill({ json: { uploads: [] } }));
  await page.route(INSTANCE, (route) =>
    route.fulfill({ json: { features: { uploads: true, imports: true, live: true, comments: true } } }),
  );
  await page.route(CHANNEL_LIVE, (route) => route.fulfill({ json: { live_streams: [] } }));
  // Generous quota by default so the preflight admits every file.
  await page.route(ME_QUOTA, (route) =>
    route.fulfill({ json: opts.quota ?? { used_bytes: 0, quota_bytes: 100 * 1024 ** 3 } }),
  );

  let draftSeq = 0;
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      draftSeq += 1;
      const id = `bv${draftSeq}`;
      return route.fulfill({ json: { ...publishedVideo(id), state: "draft" } });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(UPLOAD_SESSION, (route) => {
    const id = UPLOAD_SESSION.exec(route.request().url())![1];
    return route.fulfill({
      status: 201,
      json: { upload_id: `up-${id}`, chunk_size: 1_048_576, total_chunks: 1, size: 4, expires_at: FUTURE },
    });
  });
  await page.route(CHUNK, (route) => {
    const id = CHUNK.exec(route.request().url())![1];
    return route.fulfill({
      status: 200,
      json: {
        upload_id: `up-${id}`,
        video_id: id,
        state: "active",
        size: 4,
        chunk_size: 1_048_576,
        total_chunks: 1,
        received_chunks: [0],
        bytes_received: 4,
        expires_at: FUTURE,
      },
    });
  });
  await page.route(COMPLETE, (route) => {
    const id = COMPLETE.exec(route.request().url())![1];
    return route.fulfill({ status: 201, json: { video: publishedVideo(id) } });
  });
}

function threeFiles() {
  return ["batch-a", "batch-b", "batch-c"].map((name) => ({
    name: `${name}.mp4`,
    mimeType: "video/mp4",
    buffer: Buffer.from(`bytes-${name}`),
  }));
}

test("picking several files switches the studio to a batch queue with per-file rows", async ({
  page,
}) => {
  await signIn(page);
  await wireStudio(page);

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video file").setInputFiles(threeFiles());

  // The single-file form gives way to the queue: 3 rows, filename-derived titles.
  const queue = page.getByRole("list", { name: "Upload queue" });
  await expect(queue.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByLabel("Title for batch-a.mp4")).toHaveValue("batch-a");
  await expect(page.getByLabel("Title for batch-b.mp4")).toHaveValue("batch-b");
  await expect(page.getByLabel("Title for batch-c.mp4")).toHaveValue("batch-c");
  await expect(page.getByRole("button", { name: "Upload 3 videos" })).toBeVisible();
});

test("a batch of 3 files all upload to done (bounded parallelism drains the queue)", async ({
  page,
}) => {
  await signIn(page);
  await wireStudio(page);

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video file").setInputFiles(threeFiles());
  await page.getByRole("button", { name: "Upload 3 videos" }).click();

  // Every row finishes — the 3rd waits behind the concurrency cap of 2, then runs.
  await expect(page.getByRole("link", { name: "View video" })).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByText("3 videos uploaded.")).toBeVisible();
  // The whole batch settles → the Done affordance appears.
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
});

test("an edited per-file title is sent on that file's draft", async ({ page }) => {
  await signIn(page);
  let firstDraftBody: unknown;
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.route(ME_UPLOADS, (route) => route.fulfill({ json: { uploads: [] } }));
  await page.route(INSTANCE, (route) =>
    route.fulfill({ json: { features: { uploads: true, imports: true, live: true, comments: true } } }),
  );
  await page.route(CHANNEL_LIVE, (route) => route.fulfill({ json: { live_streams: [] } }));
  await page.route(ME_QUOTA, (route) =>
    route.fulfill({ json: { used_bytes: 0, quota_bytes: 100 * 1024 ** 3 } }),
  );
  let draftSeq = 0;
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      draftSeq += 1;
      if (draftSeq === 1) firstDraftBody = route.request().postDataJSON();
      const id = `bv${draftSeq}`;
      return route.fulfill({ json: { ...publishedVideo(id), state: "draft" } });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(UPLOAD_SESSION, (route) => {
    const id = UPLOAD_SESSION.exec(route.request().url())![1];
    return route.fulfill({
      status: 201,
      json: { upload_id: `up-${id}`, chunk_size: 1_048_576, total_chunks: 1, size: 4, expires_at: FUTURE },
    });
  });
  await page.route(CHUNK, (route) => {
    const id = CHUNK.exec(route.request().url())![1];
    return route.fulfill({
      status: 200,
      json: {
        upload_id: `up-${id}`, video_id: id, state: "active", size: 4, chunk_size: 1_048_576,
        total_chunks: 1, received_chunks: [0], bytes_received: 4, expires_at: FUTURE,
      },
    });
  });
  await page.route(COMPLETE, (route) => {
    const id = COMPLETE.exec(route.request().url())![1];
    return route.fulfill({ status: 201, json: { video: publishedVideo(id) } });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  // Two files, private privacy, and a retitled first row.
  await page.getByLabel("Video file").setInputFiles([
    { name: "one.mp4", mimeType: "video/mp4", buffer: Buffer.from("one") },
    { name: "two.mp4", mimeType: "video/mp4", buffer: Buffer.from("two") },
  ]);
  await page.getByLabel("Batch privacy").selectOption("private");
  await page.getByLabel("Title for one.mp4").fill("My renamed clip");
  await page.getByRole("button", { name: "Upload 2 videos" }).click();

  await expect(page.getByRole("link", { name: "View video" })).toHaveCount(2, { timeout: 15_000 });
  // The first draft carried the edited title + the shared batch privacy.
  expect(firstDraftBody).toMatchObject({ title: "My renamed clip", privacy: "private" });
});

test("over-quota files are marked before any bytes move", async ({ page }) => {
  await signIn(page);
  // Tiny quota: 10 bytes free. Each file declares a few bytes, so the later ones
  // are pre-flagged over quota (the greedy fit admits what fits, marks the rest).
  await wireStudio(page, { quota: { used_bytes: 0, quota_bytes: 6 } });

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video file").setInputFiles([
    { name: "fits.mp4", mimeType: "video/mp4", buffer: Buffer.from("aaaa") }, // 4 bytes → fits (0+4<=6)
    { name: "toobig.mp4", mimeType: "video/mp4", buffer: Buffer.from("bbbb") }, // 4 bytes → 8 > 6 → over
  ]);

  const overRow = page.getByRole("listitem").filter({ hasText: "toobig.mp4" });
  await expect(overRow.getByText("Over quota")).toBeVisible();
  // Only the fitting file is offered for upload.
  await expect(page.getByRole("button", { name: "Upload 1 video" })).toBeVisible();
});
