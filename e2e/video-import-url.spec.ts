import { expect, test, type Page } from "@playwright/test";

// Import-from-URL flow (UPLOAD-09, backport W2.U2). Mocked coverage of the
// two-tab source choice, the async import stage rail (queued → fetching metadata
// → downloading → scanning & processing), the safe-error + Retry path, the
// yt-dlp metadata prefill, and the honest "imports disabled" empty state. The
// real DB round-trip is proven in e2e-backed/video-import-url.spec.ts.
//
// A real backend is not running in `npm run ci`, so every endpoint the studio
// touches is mocked; unmatched /api/v1/* calls fail (refused) and the component
// degrades to its empty/failed state, exactly like the other mocked specs.

const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const INSTANCE = /\/api\/v1\/instance$/;
// POST enqueues + GET polls the same path; the mock branches on method.
const IMPORT = /\/api\/v1\/videos\/v1\/import$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;

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

// An ImportJob matching the openapi contract (state + optional stage + required
// resolver). `resolver` starts "auto" until the worker resolves it.
function importJob(
  state: string,
  overrides: { stage?: string; resolver?: string; error?: string } = {},
) {
  return {
    id: "job1",
    video_id: "v1",
    state,
    resolver: overrides.resolver ?? "auto",
    ...(overrides.stage ? { stage: overrides.stage } : {}),
    ...(overrides.error ? { error: overrides.error } : {}),
    attempts: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function instance(importsEnabled: boolean) {
  return {
    name: "Vidra",
    description: "",
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: false,
    oauth_providers: [],
    federation_enabled: false,
    terms_url: "",
    privacy_url: "",
    contact_email: "",
    features: { uploads: true, imports: importsEnabled, live: true, comments: true },
  };
}

const videoConfig = {
  categories: [],
  licenses: [],
  languages: [],
  privacies: [{ id: "public", label: "Public" }],
};

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

async function openStudio(page: Page, opts: { importsEnabled?: boolean } = {}) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(INSTANCE, (route) =>
    route.fulfill({ json: instance(opts.importsEnabled ?? true) }),
  );
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig }));
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: video({ state: "draft" }) });
    return route.fulfill({ json: { videos: [] } });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Upload a video" })).toBeVisible();
}

// The active rail step carries aria-current="step"; asserting on it is stable as
// the current step moves down the list.
function currentStage(page: Page) {
  return page.locator('li[aria-current="step"]');
}

test("the import stage rail advances queued → metadata → downloading → processing → published", async ({
  page,
}) => {
  await openStudio(page);

  // POST enqueues pending (Queued); each GET advances the stage, last one is done.
  const stages = [
    importJob("running", { stage: "resolving" }),
    importJob("running", { stage: "downloading", resolver: "ytdlp" }),
    importJob("running", { stage: "processing", resolver: "ytdlp" }),
    importJob("done", { resolver: "ytdlp" }),
  ];
  let get = 0;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 202, json: { import_job: importJob("pending") } });
    }
    const job = stages[Math.min(get, stages.length - 1)];
    get += 1;
    return route.fulfill({ json: { import_job: job } });
  });
  await page.route(VIDEO, (route) => route.fulfill({ json: video() }));

  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Import from URL" }).click();
  await page.getByLabel("Video URL").fill("https://platform.example/watch?v=abc");
  await page.getByRole("button", { name: "Publish" }).click();

  // The rail renders and walks the stages in order (each ~one poll apart).
  await expect(page.getByRole("list", { name: "Import progress" })).toBeVisible();
  await expect(currentStage(page)).toContainText("Queued");
  await expect(currentStage(page)).toContainText("Fetching metadata");
  await expect(currentStage(page)).toContainText("Downloading");
  await expect(currentStage(page)).toContainText("Scanning & processing");

  // Then the finalised video reads as published.
  await expect(page.getByText("Published!")).toBeVisible();
  await expect(page.getByRole("link", { name: /View .*My clip/ })).toBeVisible();
});

test("a failed import shows the safe error verbatim with a Retry that re-enqueues and succeeds", async ({
  page,
}) => {
  await openStudio(page);

  let posts = 0;
  let gets = 0;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      return route.fulfill({ status: 202, json: { import_job: importJob("running", { stage: "resolving" }) } });
    }
    gets += 1;
    // First attempt's poll fails; after the retry (2nd POST) the poll is done.
    if (posts < 2) {
      return route.fulfill({
        json: { import_job: importJob("failed", { error: "the source returned 404 Not Found" }) },
      });
    }
    return route.fulfill({ json: { import_job: importJob("done", { resolver: "direct" }) } });
  });
  await page.route(VIDEO, (route) => route.fulfill({ json: video() }));

  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Import from URL" }).click();
  await page.getByLabel("Video URL").fill("https://example.com/missing.mp4");
  await page.getByRole("button", { name: "Publish" }).click();

  // The backend's safe reason is shown verbatim, never "Published!".
  await expect(page.getByText("the source returned 404 Not Found")).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);

  // Retry re-enqueues against the same draft via the same endpoint → published.
  await page.getByRole("button", { name: "Retry import" }).click();
  await expect(page.getByText("Published!")).toBeVisible();
  expect(posts).toBe(2);
  expect(gets).toBeGreaterThanOrEqual(2);
});

test("the URL tab renders an honest disabled state when imports are off", async ({ page }) => {
  await openStudio(page, { importsEnabled: false });

  await page.getByRole("button", { name: "Import from URL" }).click();

  await expect(page.getByText("Imports are disabled on this instance")).toBeVisible();
  // No URL field, and Publish is disabled so the form can never be submitted.
  await expect(page.getByLabel("Video URL")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
});

test("resolved metadata prefills an empty field but never overwrites the creator's edit", async ({
  page,
}) => {
  await openStudio(page);

  const stages = [
    importJob("running", { stage: "resolving" }),
    // resolver rewritten off auto + a concrete stage ⇒ resolving is done ⇒ prefill.
    importJob("running", { stage: "downloading", resolver: "ytdlp" }),
    importJob("running", { stage: "processing", resolver: "ytdlp" }),
    importJob("done", { resolver: "ytdlp" }),
  ];
  let get = 0;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 202, json: { import_job: stages[0] } });
    }
    const job = stages[Math.min(get + 1, stages.length - 1)];
    get += 1;
    return route.fulfill({ json: { import_job: job } });
  });
  // The draft the worker resolved: a platform title + description. The user's
  // title stays (they typed it); the empty description is filled.
  await page.route(VIDEO, (route) =>
    route.fulfill({
      json: video({ title: "Platform-resolved title", description: "Resolved from the platform." }),
    }),
  );

  await page.getByLabel("Video title").fill("My own title");
  await page.getByRole("button", { name: "Import from URL" }).click();
  await page.getByLabel("Video URL").fill("https://platform.example/watch?v=abc");
  await page.getByRole("button", { name: "Publish" }).click();

  // User edit wins on title; the empty description picks up the resolved value.
  await expect(page.getByLabel("Video description")).toHaveValue("Resolved from the platform.");
  await expect(page.getByLabel("Video title")).toHaveValue("My own title");
});

test("pasting a URL with surrounding whitespace is trimmed into the field", async ({ page }) => {
  await openStudio(page);

  await page.getByRole("button", { name: "Import from URL" }).click();
  const url = page.getByLabel("Video URL");
  await url.focus();
  // Simulate a paste event carrying a URL wrapped in stray whitespace/newlines.
  await url.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text", "  https://example.com/clip.mp4\n");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(url).toHaveValue("https://example.com/clip.mp4");
});
