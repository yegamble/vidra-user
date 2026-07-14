import { expect, test, type Page } from "@playwright/test";

const INSTANCE = /\/api\/v1\/instance$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const CHANNEL = /\/api\/v1\/channels\/ada_makes$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;

function instance(policy: "hide" | "warn" | "blur" | "display") {
  return {
    name: "Vidra",
    description: "",
    short_description: "",
    default_language: "en",
    categories: [],
    moderator_languages: [],
    server_country: "",
    is_sensitive: false,
    sensitive_content_policy: policy,
    contact_form_enabled: false,
    social_links: { website: "", mastodon: "", x: "", bluesky: "" },
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
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    remote: false,
    channel_id: "c1",
    channel_handle: "ada_makes",
    channel_display_name: "Ada Makes",
    title: "Sensitive clip",
    description: "A flagged clip.",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 42,
    has_thumbnail: true,
    duration_seconds: 60,
    is_sensitive: true,
    ipfs_pinned: false,
    ...overrides,
  };
}

async function routeInstance(page: Page, policy: "hide" | "warn" | "blur" | "display") {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instance(policy) }));
}

test("the blur policy blurs sensitive video-card thumbnails and badges them", async ({
  page,
}) => {
  await routeInstance(page, "blur");
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [video()], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");

  await expect(page.getByText("Sensitive", { exact: true })).toBeVisible();
  const card = page.getByTestId("video-card-preview").filter({
    has: page.getByRole("link", { name: "Sensitive clip", exact: true }),
  });
  await expect(card.locator("img")).toHaveClass(/blur-2xl/);
});

test("the warn policy gates a sensitive watch page until the viewer confirms", async ({
  page,
}) => {
  await routeInstance(page, "warn");
  await page.route(DETAIL, (route) => route.fulfill({ json: video({ has_thumbnail: false }) }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(CHANNEL, (route) =>
    route.fulfill({
      json: {
        id: "c1",
        owner_id: "u1",
        handle: "ada_makes",
        display_name: "Ada Makes",
        description: "",
        follower_count: 0,
        created_at: new Date().toISOString(),
      },
    }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));

  await page.goto("/videos/v1");

  await expect(page.getByText("This video contains sensitive content")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("button", { name: "Watch anyway" }).click();
  await expect(page.locator("video")).toBeVisible();
});
