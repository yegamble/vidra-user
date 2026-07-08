import { expect, test, type Page } from "@playwright/test";

// Channel auto-sync management (UPLOAD-13, backport W2.U5). Mocked coverage of the
// "Auto-import from another platform" studio section: the connect form, the sync
// list with its state pills (waiting_first_run | syncing | idle | failed),
// last_sync_at, safe last_error, Sync now + Remove, the client-side URL
// validation, and the honest disabled empty state on the stable 503. The real DB
// round-trip is proven in e2e-backed/channel-sync.spec.ts.
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
// GET lists + POST creates on the same path; the mock branches on method.
const SYNCS = /\/api\/v1\/channel-syncs$/;
const SYNC_NOW = /\/api\/v1\/channel-syncs\/[^/]+\/sync-now$/;
const SYNC_ONE = /\/api\/v1\/channel-syncs\/[^/]+$/;

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

function sync(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    channel_id: "c1",
    external_channel_url: "https://www.youtube.com/@example",
    state: "waiting_first_run",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

const videoConfig = { categories: [], licenses: [], languages: [], privacies: [{ id: "public", label: "Public" }] };

const instance = {
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
  features: { uploads: true, imports: true, live: true, comments: true },
};

// Open the studio signed in, with the base studio endpoints mocked. Per-test the
// caller registers the /channel-syncs routes it needs BEFORE calling this.
async function openStudio(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(INSTANCE, (route) => route.fulfill({ json: instance }));
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));

  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("link", { name: "Studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Auto-import from another platform" }),
  ).toBeVisible();
}

test("connecting an external channel creates a sync row with a Waiting first run pill", async ({
  page,
}) => {
  let created = false;
  await page.route(SYNCS, (route) => {
    if (route.request().method() === "POST") {
      created = true;
      const body = route.request().postDataJSON() as { channel_id: string; external_channel_url: string };
      expect(body.channel_id).toBe("c1");
      expect(body.external_channel_url).toBe("https://www.youtube.com/@example");
      return route.fulfill({ status: 201, json: { channel_sync: sync() } });
    }
    return route.fulfill({ json: { channel_syncs: [] } });
  });
  await openStudio(page);

  await page.getByLabel("External channel URL").fill("https://www.youtube.com/@example");
  await page.getByRole("button", { name: "Connect" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "youtube.com/@example" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Waiting first run")).toBeVisible();
  expect(created).toBe(true);
});

test("Sync now schedules the run and the list refetch reflects the new state", async ({ page }) => {
  let get = 0;
  await page.route(SYNCS, (route) => {
    // First list = waiting_first_run; after Sync now the refetch = syncing.
    get += 1;
    const state = get <= 1 ? "waiting_first_run" : "syncing";
    return route.fulfill({ json: { channel_syncs: [sync({ state })] } });
  });
  let scheduled = false;
  await page.route(SYNC_NOW, (route) => {
    scheduled = true;
    return route.fulfill({ status: 202, body: "" });
  });
  await openStudio(page);

  const row = page.getByRole("listitem").filter({ hasText: "youtube.com/@example" });
  await expect(row.getByText("Waiting first run")).toBeVisible();

  await row.getByRole("button", { name: /Sync .* now/ }).click();

  await expect(page.getByText("Sync scheduled — it’ll run on the next pass.")).toBeVisible();
  await expect(row.getByText("Syncing")).toBeVisible();
  expect(scheduled).toBe(true);
});

test("Remove deletes the sync and drops the row", async ({ page }) => {
  await page.route(SYNCS, (route) => route.fulfill({ json: { channel_syncs: [sync()] } }));
  let deleted = false;
  await page.route(SYNC_ONE, (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
  await openStudio(page);

  const row = page.getByRole("listitem").filter({ hasText: "youtube.com/@example" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Remove sync/ }).click();

  await expect(row).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("a failed sync shows its safe last_error and a Failed pill", async ({ page }) => {
  await page.route(SYNCS, (route) =>
    route.fulfill({
      json: {
        channel_syncs: [
          sync({
            state: "failed",
            last_error: "the external channel could not be resolved",
            last_sync_at: new Date(Date.now() - 3_600_000).toISOString(),
          }),
        ],
      },
    }),
  );
  await openStudio(page);

  const row = page.getByRole("listitem").filter({ hasText: "youtube.com/@example" });
  await expect(row.getByText("Failed")).toBeVisible();
  await expect(row.getByText("the external channel could not be resolved")).toBeVisible();
});

test("the section renders an honest disabled empty state on the stable 503", async ({ page }) => {
  await page.route(SYNCS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 503,
        json: { error: { code: "service_unavailable", message: "auto-sync is off" } },
      });
    }
    return route.fulfill({ json: { channel_syncs: [] } });
  });
  await openStudio(page);

  await page.getByLabel("External channel URL").fill("https://www.youtube.com/@example");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByText("Auto-import is disabled on this instance")).toBeVisible();
  // The dead connect form is gone once the feature is known to be off.
  await expect(page.getByLabel("External channel URL")).toHaveCount(0);
});

test("a non-http(s) URL is rejected inline without hitting the network", async ({ page }) => {
  let posts = 0;
  await page.route(SYNCS, (route) => {
    if (route.request().method() === "POST") posts += 1;
    return route.fulfill({ json: { channel_syncs: [] } });
  });
  await openStudio(page);

  await page.getByLabel("External channel URL").fill("magnet:?xt=urn:btih:abc");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByText("Only http(s) URLs are supported.")).toBeVisible();
  expect(posts).toBe(0);
});
