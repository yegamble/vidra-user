import { expect, test, type Page } from "@playwright/test";

// Mocked studio coverage for password protection + embed privacy (CORE-17 /
// W1.7). No backend in `npm run ci`; the real password/embed round trips are
// proven in e2e-backed/video-password.spec.ts. This asserts the edit-form
// wiring: choosing "Password-protected" reveals the password manager, an empty
// set blocks the save, adding one unblocks it, and the embed control is present.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const CHAPTERS = /\/api\/v1\/videos\/v1\/chapters$/;
const PASSWORDS = /\/api\/v1\/videos\/v1\/passwords$/;
const EMBED_PRIVACY = /\/api\/v1\/videos\/v1\/embed-privacy$/;

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
    privacy: "private",
    state: "published",
    created_at: new Date().toISOString(),
    views: 0,
    has_thumbnail: false,
    ...overrides,
  };
}

function videoConfig() {
  return { categories: [], licenses: [], languages: [], privacies: [] };
}

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

test("password-protecting a video reveals the manager, blocks an empty-set save, then saves", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [video()] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(CHAPTERS, (route) => route.fulfill({ json: { chapters: [] } }));
  await page.route(EMBED_PRIVACY, (route) => route.fulfill({ json: { status: "enabled" } }));

  // The password set starts empty; the add POST returns the stored row.
  const passwords: Array<{ id: string; created_at: string }> = [];
  await page.route(PASSWORDS, (route) => {
    if (route.request().method() === "POST") {
      const row = { id: "pw1", created_at: new Date().toISOString() };
      passwords.push(row);
      return route.fulfill({ status: 201, json: row });
    }
    return route.fulfill({ json: { passwords } });
  });

  let patchCount = 0;
  let patchBody: Record<string, unknown> | null = null;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchCount += 1;
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: video({ privacy: "password" }) });
    }
    return route.fulfill({ json: video() });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  await row.getByRole("button", { name: "Edit" }).click();

  // The embed control is always present in the edit form.
  await expect(page.getByText("Where can this be embedded?")).toBeVisible();

  // Choosing "Password-protected" reveals the password manager (empty → warning).
  await page.getByLabel("Edit privacy").selectOption("password");
  await expect(page.getByText("Passwords", { exact: true })).toBeVisible();
  await expect(page.getByText(/No passwords yet/)).toBeVisible();

  // Saving with zero passwords is blocked client-side (the server would 400).
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Add at least one password/)).toBeVisible();
  expect(patchCount).toBe(0);

  // Add a password → the set is non-empty → the save is unblocked and PATCHes.
  await page.getByLabel("New password").fill("sekret-pass");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Password 1")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => patchCount).toBe(1);
  expect(patchBody).toMatchObject({ privacy: "password" });
});
