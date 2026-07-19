import { expect, test, type Locator, type Page } from "@playwright/test";

// Mocked coverage for the studio thumbnail frame-pick (UPLOAD-04). A real backend
// is not running in `npm run ci`; the DB round-trip (frame extracted, poster
// refetched) is proven in e2e-backed/upload-thumbnail.spec.ts.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const THUMBNAIL = /\/api\/v1\/videos\/v1\/thumbnail(\?|$)/;
const STORYBOARD_VTT = /\/api\/v1\/videos\/v1\/storyboard\.vtt(\?|$)/;
const STORYBOARD_JPG = /\/api\/v1\/videos\/v1\/storyboard\.jpg(\?|$)/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original(\?|$)/;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // minimal JPEG marker bytes

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
    title: "Poster clip",
    description: "",
    privacy: "public",
    state: "published",
    has_thumbnail: false,
    has_storyboard: true,
    duration_seconds: 30,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const STORYBOARD_VTT_BODY = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:02.000",
  "storyboard.jpg#xywh=0,0,160,90",
  "",
  "00:00:02.000 --> 00:00:04.000",
  "storyboard.jpg#xywh=160,0,160,90",
  "",
  "00:00:04.000 --> 00:00:06.000",
  "storyboard.jpg#xywh=320,0,160,90",
  "",
].join("\n");

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

// Wire the studio down to an open edit surface for video v1 with the given detail.
async function openEditor(page: Page, detail: Record<string, unknown>) {
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video(detail)] } }),
  );
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(VIDEO, (route) => route.fulfill({ json: video(detail) }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.route(STORYBOARD_VTT, (route) =>
    route.fulfill({ status: 200, contentType: "text/vtt", body: STORYBOARD_VTT_BODY }),
  );
  await page.route(STORYBOARD_JPG, (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG }),
  );
  await page.route(ORIGINAL, (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([0, 0, 0, 0]) }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("link", { name: "Content", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Poster clip" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
}

// Set a controlled range input to `value` through the native setter so React's
// onChange fires; returns the value the browser settled on (step-normalized).
async function setRange(slider: Locator, value: number): Promise<number> {
  await slider.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  return Number(await slider.inputValue());
}

test("a creator picks a poster frame from the storyboard scrubber", async ({ page }) => {
  await signIn(page);

  let postedBody: { at_seconds?: number } | null = null;
  await page.route(THUMBNAIL, (route) => {
    if (route.request().method() === "POST") {
      postedBody = route.request().postDataJSON() as { at_seconds?: number };
      return route.fulfill({
        status: 201,
        json: {
          id: "f1",
          kind: "thumbnail",
          content_type: "image/jpeg",
          size_bytes: 4,
          created_at: new Date().toISOString(),
        },
      });
    }
    // The <img> preview GET after the pick (cache-busted src).
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
  });

  await openEditor(page, { has_storyboard: true });

  // No poster yet; the frame-pick affordance is available (known duration).
  await expect(page.getByText("No thumbnail yet.")).toBeVisible();
  await page.getByRole("button", { name: "Pick from video" }).click();

  // The storyboard sprite tile previews the frame (not the <video> fallback).
  await expect(page.getByRole("img", { name: "Frame preview" })).toBeVisible();

  const slider = page.getByLabel("Frame position");
  const at = await setRange(slider, 4.5);
  expect(at).toBeGreaterThan(0);

  const posted = page.waitForResponse(
    (r) => THUMBNAIL.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Use this frame" }).click();
  await posted;

  // The POST carried the scrubbed timestamp, and the new poster renders.
  expect(postedBody).not.toBeNull();
  expect(postedBody!.at_seconds).toBeCloseTo(at, 5);
  await expect(page.getByRole("img", { name: "Current thumbnail" })).toBeVisible();
});

test("a creator picks a poster frame with the muted-video fallback (no storyboard)", async ({
  page,
}) => {
  await signIn(page);

  let postedBody: { at_seconds?: number } | null = null;
  await page.route(THUMBNAIL, (route) => {
    if (route.request().method() === "POST") {
      postedBody = route.request().postDataJSON() as { at_seconds?: number };
      return route.fulfill({
        status: 201,
        json: {
          id: "f1",
          kind: "thumbnail",
          content_type: "image/jpeg",
          size_bytes: 4,
          created_at: new Date().toISOString(),
        },
      });
    }
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
  });

  await openEditor(page, { has_storyboard: false });

  await page.getByRole("button", { name: "Pick from video" }).click();

  const slider = page.getByLabel("Frame position");
  const at = await setRange(slider, 9);

  const posted = page.waitForResponse(
    (r) => THUMBNAIL.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Use this frame" }).click();
  await posted;

  expect(postedBody).not.toBeNull();
  expect(postedBody!.at_seconds).toBeCloseTo(at, 5);
  await expect(page.getByRole("img", { name: "Current thumbnail" })).toBeVisible();
});

test("a frame-pick surfaces the server's typed failure verbatim-safe", async ({ page }) => {
  await signIn(page);

  await page.route(THUMBNAIL, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "service_unavailable",
            message: "frame extractor unavailable",
          },
        },
      });
    }
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
  });

  await openEditor(page, { has_storyboard: true });
  await page.getByRole("button", { name: "Pick from video" }).click();
  await setRange(page.getByLabel("Frame position"), 4.5);
  await page.getByRole("button", { name: "Use this frame" }).click();

  // The 503 maps to the honest "not available on this instance" copy; no poster.
  await expect(page.getByText(/isn.t available on this instance/i)).toBeVisible();
  await expect(page.getByRole("img", { name: "Current thumbnail" })).toHaveCount(0);
});

test("frame-pick is hidden until the video has a known duration", async ({ page }) => {
  await signIn(page);
  await page.route(THUMBNAIL, (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG }),
  );

  // A draft with no processed original → no probed duration → no frame-pick.
  await openEditor(page, { state: "draft", has_storyboard: false, duration_seconds: null });

  await expect(page.getByText("No thumbnail yet.")).toBeVisible();
  // The custom upload stays available; only the frame-pick affordance is gone.
  await expect(page.getByLabel("Thumbnail image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick from video" })).toHaveCount(0);
});
