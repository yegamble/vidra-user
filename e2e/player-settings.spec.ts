import { expect, test, type Page } from "@playwright/test";

// Mocked player-settings coverage (PLAY-07 / W1.6). A real backend is not running
// in `npm run ci`; the persistence round-trip is proven in
// e2e-backed/player-settings.spec.ts. Here we drive the settings surface (each
// control saves ITS OWN field via a merge-PUT) and prove the bespoke player
// consumes the effective default speed on the watch page.
const REFRESH = /\/api\/v1\/auth\/refresh$/;
const ME = /\/api\/v1\/auth\/me$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const SETTINGS = /\/api\/v1\/me\/player-settings$/;
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

const DEFAULTS = {
  autoplay_next: true,
  default_speed: 1,
  default_quality: "auto",
  captions_default: false,
  theater_default: false,
  video_card_previews_enabled: false,
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
    email_verified: true,
    display_name: "Ada",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

// authed installs the boot-refresh + /auth/me mocks so a direct goto lands
// signed in (the httpOnly cookie is simulated by fulfilling the refresh).
async function authed(page: Page) {
  await page.route(REFRESH, (route) => route.fulfill({ json: session }));
  await page.route(ME, (route) => route.fulfill({ json: session.user }));
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
}

// mockSettings serves GET (the current state) and PUT (merge the changed field,
// return the full object). `puts` records each PUT body for assertion.
async function mockSettings(
  page: Page,
  initial: typeof DEFAULTS = DEFAULTS,
): Promise<{ puts: Record<string, unknown>[] }> {
  const state = { ...initial };
  const puts: Record<string, unknown>[] = [];
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "PUT") {
      const patch = route.request().postDataJSON() as Record<string, unknown>;
      puts.push(patch);
      Object.assign(state, patch);
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: state });
  });
  return { puts };
}

test("prompts anonymous viewers to sign in", async ({ page }) => {
  await page.route(REFRESH, (route) => route.fulfill({ status: 401, json: { error: { code: "unauthorized", message: "no" } } }));
  await page.goto("/settings/playback");
  await expect(page.getByText("Sign in to manage playback")).toBeVisible();
});

test("renders every control at its stored value and merge-PUTs single fields", async ({
  page,
}) => {
  await authed(page);
  const { puts } = await mockSettings(page, {
    ...DEFAULTS,
    default_speed: 1.5,
    default_quality: "1080p",
    theater_default: true,
  });

  await page.goto("/settings/playback");

  // Controls hydrate from the GET.
  const autoplay = page.getByRole("switch", { name: "Autoplay next" });
  await expect(autoplay).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Default speed")).toHaveValue("1.5");
  await expect(page.getByLabel("Default quality")).toHaveValue("1080p");
  await expect(page.getByRole("switch", { name: "Theater mode by default" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const previews = page.getByRole("switch", { name: "Inline video previews" });
  await expect(previews).toHaveAttribute("aria-checked", "false");

  // Toggling autoplay sends ONLY autoplay_next.
  await autoplay.click();
  await expect(autoplay).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => puts.at(-1)).toEqual({ autoplay_next: false });

  // Changing the default speed sends ONLY default_speed, as a number.
  await page.getByLabel("Default speed").selectOption("2");
  await expect.poll(() => puts.at(-1)).toEqual({ default_speed: 2 });

  // Changing the default quality sends ONLY default_quality.
  await page.getByLabel("Default quality").selectOption("720p");
  await expect.poll(() => puts.at(-1)).toEqual({ default_quality: "720p" });

  // The viewer can override the administrator-provided starting value.
  await previews.click();
  await expect.poll(() => puts.at(-1)).toEqual({ video_card_previews_enabled: true });

  // Each PUT carried exactly one field (true merge semantics).
  expect(puts.every((p) => Object.keys(p).length === 1)).toBe(true);
});

test("the bespoke player starts at the user's default speed on the watch page", async ({
  page,
}) => {
  await authed(page);
  await mockSettings(page, { ...DEFAULTS, default_speed: 1.5 });
  await page.route(DETAIL, (route) =>
    route.fulfill({
      json: {
        id: "v1",
        channel_id: "c1",
        title: "Watch Me",
        description: "",
        privacy: "public",
        state: "published",
        created_at: new Date().toISOString(),
        views: 3,
        has_thumbnail: false,
        channel_handle: "h-c1",
        channel_display_name: "Channel c1",
      },
    }),
  );
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  // The shell consumed the per-user default_speed (no session pick made) — the
  // Speed button reads 1.5× and the media element is at 1.5×.
  await expect(page.getByRole("button", { name: "Speed: 1.5×" })).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.playbackRate))
    .toBe(1.5);
});
