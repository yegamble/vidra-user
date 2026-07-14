import { expect, test, type Page } from "@playwright/test";

// Mocked avatar/banner coverage (a real backend is not running in `npm run ci`;
// the persistence round-trip is proven separately in e2e-backed/avatar.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const ME = /\/api\/v1\/auth\/me$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_AVATAR = /\/api\/v1\/me\/avatar$/;
const USER_AVATAR_IMG = /\/api\/v1\/users\/u1\/avatar(\?|$)/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const CHANNEL_BANNER = /\/api\/v1\/channels\/ada_makes\/banner(\?|$)/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;

// A REAL (decodable) 1x1 PNG: the Avatar/banner components fall back to the
// initial letter via onError, and Chromium fires onError for undecodable image
// bytes — so the mocked serve routes must return a valid image, not just magic
// bytes, or every "renders the image" assertion would see the fallback instead.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwcHAAAAGEAMGDX2mUAAAAAElFTkSuQmCC",
  "base64",
);

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: true,
    display_name: "Ada",
    bio: "",
    created_at: new Date().toISOString(),
    has_avatar: false,
    has_banner: false,
    ...overrides,
  };
}

function profileImage(kind: "avatar" | "banner") {
  return {
    kind,
    content_type: "image/png",
    size_bytes: PNG.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function signIn(page: Page, sessionUser = user()) {
  await page.route(LOGIN, (route) =>
    route.fulfill({
      json: { token: "acc", token_type: "Bearer", expires_in: 900, user: sessionUser },
    }),
  );
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

test("uploading an avatar in settings updates the preview and the header", async ({ page }) => {
  await signIn(page); // has_avatar: false — the header/settings start on the fallback
  await page.route(ME, (route) => route.fulfill({ json: user({ has_avatar: true }) }));
  await page.route(MY_AVATAR, (route) =>
    route.fulfill({ status: 201, json: profileImage("avatar") }),
  );
  await page.route(USER_AVATAR_IMG, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );

  // No avatar yet: the header shows no avatar image.
  await expect(page.getByRole("banner").locator('img[src*="/users/u1/avatar"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const avatarSection = page.getByRole("region", { name: "Avatar", exact: true });
  await expect(avatarSection).toBeVisible();
  // The initial-letter fallback, not an image (and no Remove control yet).
  await expect(avatarSection.locator("img")).toHaveCount(0);
  await expect(avatarSection.getByRole("button", { name: "Remove avatar" })).toHaveCount(0);

  const posted = page.waitForResponse(
    (r) => MY_AVATAR.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await avatarSection.getByLabel("Avatar image").setInputFiles({
    name: "face.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await posted;

  // The preview renders cache-busted, a Remove control appears, and the header
  // avatar shows up (the manager re-reads /auth/me, which now says has_avatar).
  const preview = avatarSection.getByRole("img", { name: "Current avatar" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /\/users\/u1\/avatar\?v=1$/);
  await expect(avatarSection.getByRole("button", { name: "Remove avatar" })).toBeVisible();
  await expect(page.getByRole("banner").locator('img[src*="/users/u1/avatar"]')).toBeVisible();
});

test("an unsupported avatar file type shows the 415 message", async ({ page }) => {
  await signIn(page);
  await page.route(MY_AVATAR, (route) =>
    route.fulfill({
      status: 415,
      json: { error: { code: "unsupported_media_type", message: "unsupported image type" } },
    }),
  );

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const avatarSection = page.getByRole("region", { name: "Avatar", exact: true });
  await avatarSection.getByLabel("Avatar image").setInputFiles({
    name: "clip.gif",
    mimeType: "image/gif",
    buffer: PNG,
  });

  await expect(avatarSection.getByText("The image must be a JPEG, PNG, or WebP.")).toBeVisible();
  await expect(avatarSection.locator("img")).toHaveCount(0); // still the fallback
});

test("removing the avatar restores the initial-letter fallback", async ({ page }) => {
  await signIn(page, user({ has_avatar: true }));
  await page.route(ME, (route) => route.fulfill({ json: user({ has_avatar: false }) }));
  await page.route(USER_AVATAR_IMG, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );
  await page.route(MY_AVATAR, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const avatarSection = page.getByRole("region", { name: "Avatar", exact: true });
  await expect(avatarSection.getByRole("img", { name: "Current avatar" })).toBeVisible();

  const deleted = page.waitForResponse(
    (r) => MY_AVATAR.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await avatarSection.getByRole("button", { name: "Remove avatar" }).click();
  await deleted;

  await expect(avatarSection.locator("img")).toHaveCount(0);
  await expect(avatarSection.getByRole("button", { name: "Remove avatar" })).toHaveCount(0);
});

test("a creator can set the channel banner from the studio row editor", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "c1",
            owner_id: "u1",
            handle: "ada_makes",
            display_name: "Ada Makes",
            description: "",
            follower_count: 0,
            created_at: new Date().toISOString(),
            has_avatar: false,
            has_banner: false,
          },
        ],
      },
    }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(/\/api\/v1\/channels\/ada_makes\/live$/, (route) =>
    route.fulfill({ json: { live_streams: [] } }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.route(CHANNEL_BANNER, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 201, json: profileImage("banner") });
    }
    // The <img> preview GET after upload (cache-busted src).
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("button", { name: "Edit ada_makes" }).click();

  const bannerSection = page.getByRole("region", { name: "Channel banner" });
  await expect(bannerSection.getByText("No banner yet.")).toBeVisible();

  const posted = page.waitForResponse(
    (r) => CHANNEL_BANNER.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await bannerSection.getByLabel("Channel banner image").setInputFiles({
    name: "wide.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await posted;

  await expect(bannerSection.getByRole("img", { name: "Current channel banner" })).toBeVisible();
  await expect(bannerSection.getByRole("button", { name: "Remove channel banner" })).toBeVisible();
});

test("the channel page renders the banner and avatar when set", async ({ page }) => {
  await page.route(/\/api\/v1\/channels\/ada$/, (route) =>
    route.fulfill({
      json: {
        id: "ch1",
        owner_id: "u1",
        handle: "ada",
        display_name: "Ada Makes",
        description: "",
        follower_count: 3,
        created_at: new Date().toISOString(),
        has_avatar: true,
        has_banner: true,
      },
    }),
  );
  await page.route(/\/api\/v1\/channels\/ada\/videos$/, (route) =>
    route.fulfill({ json: { videos: [] } }),
  );
  await page.route(/\/api\/v1\/channels\/ada\/(avatar|banner)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );

  await page.goto("/channels/ada");

  await expect(page.getByRole("heading", { name: "Ada Makes" })).toBeVisible();
  await expect(page.locator('img[src*="/channels/ada/banner"]')).toBeVisible();
  await expect(page.locator('img[src*="/channels/ada/avatar"]')).toBeVisible();
});

test("comment authors get avatars, with an initial-letter fallback on 404", async ({ page }) => {
  const detail = {
    id: "v1",
    channel_id: "c1",
    title: "Watch Me",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 1,
    has_thumbnail: false,
  };
  function comment(id: string, authorId: string, username: string, display: string) {
    return {
      id,
      video_id: "v1",
      body: `Comment by ${display}`,
      author_id: authorId,
      author_username: username,
      author_display_name: display,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited: false,
    };
  }
  await page.route(/\/api\/v1\/videos\/v1$/, (route) => route.fulfill({ json: detail }));
  await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({
      json: {
        comments: [
          comment("c1", "u2", "bob", "Bob Jones"),
          comment("c2", "u3", "cara", "Cara Vale"),
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  // Bob has an avatar; Cara's serve URL 404s (none set) → fallback initial.
  await page.route(/\/api\/v1\/users\/u2\/avatar(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );
  await page.route(/\/api\/v1\/users\/u3\/avatar(\?|$)/, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no avatar" } } }),
  );

  await page.goto("/videos/v1");
  const comments = page.getByRole("region", { name: "Comments" });
  await expect(comments.getByText("Comment by Bob Jones")).toBeVisible();

  // Bob's avatar image renders; Cara's broken image swaps to the "C" fallback.
  await expect(comments.locator('img[src*="/users/u2/avatar"]')).toBeVisible();
  await expect(comments.locator('img[src*="/users/u3/avatar"]')).toHaveCount(0);
  await expect(comments.getByText("C", { exact: true })).toBeVisible();
});
