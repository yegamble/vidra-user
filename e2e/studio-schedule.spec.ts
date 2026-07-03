import { expect, test, type Page } from "@playwright/test";

// Mocked scheduled-publish coverage (a real backend is not running in
// `npm run ci`; the publish_at persistence round-trip is proven in
// e2e-backed/schedule.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const UPLOAD = /\/api\/v1\/videos\/v1\/file$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;

// The same local-value -> ISO conversion the form performs (the Playwright
// runner and the browser share the host time zone, so the expectation matches).
function isoOf(local: string): string {
  return new Date(local).toISOString();
}

// The same ISO -> datetime-local conversion the edit form performs.
function localInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("publishing with a schedule sends publish_at and reports the scheduled outcome", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  let draftBody: Record<string, unknown> | undefined;
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      draftBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  // The upload finishes processing but parks in "scheduled" until publish_at.
  await page.route(UPLOAD, (route) =>
    route.fulfill({
      json: { video: video({ state: "scheduled", publish_at: isoOf("2030-01-02T12:30") }) },
    }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Schedule publish").fill("2030-01-02T12:30");
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  // The scheduled outcome is its own honest message — not "Published!".
  await expect(page.getByText("is scheduled — it will publish automatically", { exact: false })).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
  expect(draftBody).toMatchObject({ title: "My clip", publish_at: isoOf("2030-01-02T12:30") });
});

test("a scheduled row shows the badge + publish time, and the edit form can move the schedule", async ({
  page,
}) => {
  const scheduledIso = isoOf("2030-01-02T12:30");
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({
      json: { videos: [video({ state: "scheduled", publish_at: scheduledIso })] },
    }),
  );
  let patchBody: Record<string, unknown> | undefined;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        json: video({ state: "scheduled", publish_at: isoOf("2030-06-01T09:00") }),
      });
    }
    // GET: the edit form fetches the full detail to pre-fill.
    return route.fulfill({ json: video({ state: "scheduled", publish_at: scheduledIso }) });
  });
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  // The Scheduled state badge + the human publish time are on the row.
  await expect(row.getByText("scheduled", { exact: true })).toBeVisible();
  await expect(row.getByText("publishes", { exact: false })).toBeVisible();

  await row.getByRole("button", { name: "Edit" }).click();
  // Pre-filled with the current schedule (in the local zone) — move it.
  const field = page.getByLabel("Edit scheduled publish");
  await expect(field).toHaveValue(localInputValue(scheduledIso));
  await field.fill("2030-06-01T09:00");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(row.getByRole("button", { name: "Edit" })).toBeVisible();
  expect(patchBody).toMatchObject({ publish_at: isoOf("2030-06-01T09:00") });
});

test("an unchanged schedule is not re-sent on save", async ({ page }) => {
  const scheduledIso = isoOf("2030-01-02T12:30");
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({
      json: { videos: [video({ state: "scheduled", publish_at: scheduledIso })] },
    }),
  );
  let patchBody: Record<string, unknown> | undefined;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: video({ state: "scheduled", publish_at: scheduledIso, title: "Renamed" }) });
    }
    return route.fulfill({ json: video({ state: "scheduled", publish_at: scheduledIso }) });
  });
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit title").fill("Renamed");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: "Renamed" })).toBeVisible();
  // Re-sending the untouched schedule would 422 once it lies in the past.
  expect(patchBody).toMatchObject({ title: "Renamed" });
  expect(patchBody).not.toHaveProperty("publish_at");
});

test("a published video's edit surface has no schedule field", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [video()] } }));
  await page.route(VIDEO, (route) => route.fulfill({ json: video() }));
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  // The edit form is open (title field visible) but scheduling is absent — the
  // backend rejects publish_at on a published video.
  await expect(page.getByLabel("Edit title")).toBeVisible();
  await expect(page.getByLabel("Edit scheduled publish")).toHaveCount(0);
});
