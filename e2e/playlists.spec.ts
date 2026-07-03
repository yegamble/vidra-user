import { expect, test, type Page } from "@playwright/test";

// Mocked playlist coverage (a real backend is not running in `npm run ci`;
// the persistence round-trip is proven in e2e-backed/playlists.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_PLAYLISTS = /\/api\/v1\/me\/playlists$/;
const CREATE = /\/api\/v1\/playlists$/;
const DETAIL = /\/api\/v1\/playlists\/p1$/;
const ADD = /\/api\/v1\/playlists\/p1\/videos$/;
const REMOVE = /\/api\/v1\/playlists\/p1\/videos\/v1$/;
const THUMBNAIL = /\/api\/v1\/playlists\/p1\/thumbnail(\?|$)/;
// Watch-page mocks.
const VIDEO = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const SAVED = /\/api\/v1\/me\/saved(\?|$)/;
const PROGRESS = /\/api\/v1\/videos\/v1\/watch-progress$/;

function video(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 1,
    has_thumbnail: false,
  };
}

function playlist(id: string, title: string, count: number) {
  return {
    id,
    title,
    description: "",
    visibility: "private",
    video_count: count,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const detail = video("v1", "Watch Me");

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
    display_name: "Ada Makes",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("playlists prompt anonymous viewers to sign in", async ({ page }) => {
  await page.goto("/playlists");
  await expect(page.getByText("Sign in to see your playlists")).toBeVisible();
});

test("creating a playlist adds it to the list", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) => route.fulfill({ json: { playlists: [] } }));
  await page.route(CREATE, (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: playlist("p1", "My Mix", 0) });
    return route.fulfill({ json: { playlists: [] } });
  });

  await page.getByRole("link", { name: "Playlists" }).click();
  await expect(page.getByText("No playlists yet")).toBeVisible();
  await page.getByLabel("Playlist title").fill("My Mix");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("link", { name: /My Mix/ })).toBeVisible();
});

test("playlists render as cards with a count badge and a privacy badge", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({
      json: {
        playlists: [
          playlist("p1", "My Mix", 3),
          { ...playlist("p2", "Show Reel", 1), visibility: "public" },
        ],
      },
    }),
  );

  await page.getByRole("link", { name: "Playlists" }).click();
  const cards = page.getByRole("main").getByRole("listitem");
  await expect(cards).toHaveCount(2);
  // The private playlist carries its badge; the count badge reads naturally.
  const mix = cards.filter({ hasText: "My Mix" });
  await expect(mix.getByText("3 videos")).toBeVisible();
  await expect(mix.getByText("Private")).toBeVisible();
  // A public playlist has no privacy badge.
  const reel = cards.filter({ hasText: "Show Reel" });
  await expect(reel.getByText("1 video", { exact: true })).toBeVisible();
  await expect(reel.getByText("Public")).toHaveCount(0);
  // The card links to the detail page.
  await expect(mix.getByRole("link", { name: /My Mix/ })).toHaveAttribute(
    "href",
    "/playlists/p1",
  );
});

test("the playlist detail shows videos and the owner can remove one", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 1)] } }),
  );
  await page.route(DETAIL, (route) =>
    route.fulfill({ json: { ...playlist("p1", "My Mix", 1), videos: [video("v1", "Clip")] } }),
  );
  await page.route(REMOVE, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByRole("link", { name: /My Mix/ }).click();
  await expect(page.getByRole("heading", { name: "My Mix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clip" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Clip from playlist" }).click();
  await expect(page.getByRole("heading", { name: "Clip" })).toBeHidden();
});

test("the owner can reorder playlist items", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 2)] } }),
  );
  await page.route(DETAIL, (route) =>
    route.fulfill({
      json: { ...playlist("p1", "My Mix", 2), videos: [video("v1", "First"), video("v2", "Second")] },
    }),
  );
  // PUT reorder → 204; the body is asserted below via waitForRequest.
  await page.route(/\/api\/v1\/playlists\/p1\/videos$/, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByRole("link", { name: /My Mix/ }).click();
  await expect(page.getByRole("heading", { name: "First" })).toBeVisible();

  // Move "Second" up → PUT the full new order [v2, v1].
  const reordered = page.waitForRequest(
    (r) => /\/api\/v1\/playlists\/p1\/videos$/.test(r.url()) && r.method() === "PUT",
  );
  await page.getByRole("button", { name: "Move Second up" }).click();
  const req = await reordered;
  expect(req.postDataJSON()).toEqual({ video_ids: ["v2", "v1"] });

  // The list reordered optimistically: "Second" is now first, so its Move up is disabled.
  await expect(page.getByRole("button", { name: "Move Second up" })).toBeDisabled();
});

test("the owner can edit a playlist's title and visibility", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 1)] } }),
  );
  // One handler serves GET (detail) and PATCH (update) on /playlists/p1; the
  // mutable `current` lets the post-save refetch reflect the change.
  let current = { ...playlist("p1", "My Mix", 1), videos: [video("v1", "Clip")] };
  await page.route(DETAIL, (route) => {
    if (route.request().method() === "PATCH") {
      current = { ...current, ...route.request().postDataJSON() };
      return route.fulfill({ json: current });
    }
    return route.fulfill({ json: current });
  });

  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByRole("link", { name: /My Mix/ }).click();
  await expect(page.getByRole("heading", { name: "My Mix" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Playlist title").fill("My Renamed Mix");
  await page.getByLabel("Playlist visibility").selectOption("public");
  const patched = page.waitForRequest(
    (r) => /\/api\/v1\/playlists\/p1$/.test(r.url()) && r.method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save" }).click();
  const req = await patched;
  expect(req.postDataJSON()).toMatchObject({ title: "My Renamed Mix", visibility: "public" });

  await expect(page.getByRole("heading", { name: "My Renamed Mix" })).toBeVisible();
  await expect(page.getByText(/· public/)).toBeVisible();
});

test("the owner can delete a playlist", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 0)] } }),
  );
  await page.route(DETAIL, (route) => {
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ json: { ...playlist("p1", "My Mix", 0), videos: [] } });
  });

  // Reach the detail page via client-side nav so the in-memory session survives.
  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByRole("link", { name: /My Mix/ }).click();
  await page.getByRole("button", { name: "Delete playlist" }).click();
  await expect(page).toHaveURL(/\/playlists$/);
});

test("the owner can upload and remove a playlist cover from the detail page", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 1)] } }),
  );
  await page.route(DETAIL, (route) =>
    route.fulfill({ json: { ...playlist("p1", "My Mix", 1), videos: [video("v1", "Clip")] } }),
  );
  let posted = false;
  await page.route(THUMBNAIL, (route) => {
    const method = route.request().method();
    if (method === "POST") {
      posted = true;
      return route.fulfill({ status: 201, json: { ...playlist("p1", "My Mix", 1), has_thumbnail: true } });
    }
    if (method === "DELETE") return route.fulfill({ status: 204, body: "" });
    // GET: the cache-busted <img> preview after upload.
    return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from([137, 80, 78, 71]) });
  });

  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByRole("link", { name: /My Mix/ }).click();
  await expect(page.getByRole("heading", { name: "My Mix" })).toBeVisible();

  // The owner cover manager appears (no cover yet).
  const cover = page.getByRole("region", { name: "Playlist cover" });
  await expect(cover.getByText("No cover yet.")).toBeVisible();

  const uploaded = page.waitForResponse(
    (r) => THUMBNAIL.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByLabel("Cover image").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await uploaded;
  await expect(cover.getByRole("img", { name: "Current cover" })).toBeVisible();
  expect(posted).toBe(true);

  // Remove it → back to the no-cover note.
  await cover.getByRole("button", { name: "Remove cover" }).click();
  await expect(cover.getByText("No cover yet.")).toBeVisible();
});

test("an unsupported playlist cover type shows a friendly error", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 1)] } }),
  );
  await page.route(DETAIL, (route) =>
    route.fulfill({ json: { ...playlist("p1", "My Mix", 1), videos: [] } }),
  );
  await page.route(THUMBNAIL, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 415,
          json: { error: { code: "unsupported_media_type", message: "unsupported type" } },
        })
      : route.continue(),
  );

  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByRole("link", { name: /My Mix/ }).click();
  const cover = page.getByRole("region", { name: "Playlist cover" });
  await page.getByLabel("Cover image").setInputFiles({
    name: "cover.gif",
    mimeType: "image/gif",
    buffer: Buffer.from([71, 73, 70]),
  });
  await expect(cover.getByText("The image must be a JPEG, PNG, or WebP.")).toBeVisible();
});

test("playlist cards render the uploaded cover image when set", async ({ page }) => {
  await signIn(page);
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [{ ...playlist("p1", "Covered Mix", 2), has_thumbnail: true }] } }),
  );
  await page.route(THUMBNAIL, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from([137, 80, 78, 71]) }),
  );

  await page.getByRole("link", { name: "Playlists" }).click();
  const card = page.getByRole("main").getByRole("listitem").filter({ hasText: "Covered Mix" });
  // The cover is decorative (alt=""), so match the backend image by its src.
  await expect(card.locator('img[src*="/api/v1/playlists/p1/thumbnail"]')).toBeVisible();
});

test("a signed-in viewer can add a video to a playlist from the watch page", async ({ page }) => {
  await signIn(page);
  await page.route(VIDEO, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) => route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }));
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(SAVED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(PROGRESS, (route) => {
    if (route.request().method() === "PUT") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ json: { video_id: "v1", position_seconds: 0 } });
  });
  await page.route(MY_PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "My Mix", 0)] } }),
  );
  await page.route(ADD, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("heading", { name: "Watch Me" }).click();
  await page.getByRole("button", { name: "Save to playlist" }).click();
  const addBtn = page.getByRole("button", { name: "My Mix" });
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(addBtn).toHaveAttribute("aria-pressed", "true");
});
