import { expect, test, type Page } from "@playwright/test";

const REFRESH = /\/api\/v1\/auth\/refresh$/;
const ME = /\/api\/v1\/auth\/me$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const INSTANCE = /\/api\/v1\/instance$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const PLAYER_SETTINGS = /\/api\/v1\/me\/player-settings$/;
const ORIGINAL = /\/api\/v1\/videos\/v[12]\/original/;
const CAPTION_LIST = /\/api\/v1\/videos\/v[12]\/captions$/;
const CAPTION_VTT = /\/api\/v1\/videos\/v[12]\/captions\/en$/;
const STORYBOARD_VTT = /\/api\/v1\/videos\/v[12]\/storyboard\.vtt$/;
const STORYBOARD_IMAGE = /\/api\/v1\/videos\/v[12]\/storyboard\.jpg$/;

// A deterministic ten-second 160×90 H.264 MP4. Keeping the media in the test
// makes the interaction test hermetic: Chromium performs real metadata/playback
// work without a backend or an external network dependency.
const TINY_MP4 = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAOzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAJxAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAt10cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAJxAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAKAAAABaAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAACcQAACAAAABAAAAAAJVbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAACgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACAG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAcBzdGJsAAAAwHN0c2QAAAAAAAAAAQAAALBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAKAAWgBIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANmF2Y0MBZAAK/+EAGWdkAAqs2UKN+TARAAADAAEAAAMAAg8SJZYBAAZo6+PLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAAsAAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAoAAEAAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAABgY3R0cwAAAAAAAAAKAAAAAQAAgAAAAAABAAFAAAAAAAEAAIAAAAAAAQAAAAAAAAABAABAAAAAAAEAAUAAAAAAAQAAgAAAAAABAAAAAAAAAAEAAEAAAAAAAQAAgAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAoAAAABAAAAPHN0c3oAAAAAAAAAAAAAAAoAAALlAAAAEAAAAA0AAAANAAAADQAAABYAAAAPAAAADQAAAA0AAAAWAAAAFHN0Y28AAAAAAAAAAQAAA+MAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYyLjEyLjEwMAAAAAhmcmVlAAADeW1kYXQAAAKtBgX//6ncRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MyBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49MSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAADBliIQAF//+99S3zLLuByK2C6j3op4mX0N1JQGf193qE5JXXgFhvOYYwGbAAaUGnP0AAAAMQZokbEF//tqmWAPyAAAACUGeQniC3wABgwAAAAkBnmF0QV8AAk4AAAAJAZ5jakFfAAJPAAAAEkGaaEmoQWiZTAgt//7WpVAD8wAAAAtBnoZFESwW/wABgwAAAAkBnqV0QV8AAk8AAAAJAZ6nakFfAAJOAAAAEkGaqUmoQWyZTAgr//7WpVAD8g==",
  "base64",
);

const user = {
  id: "u1",
  username: "ada",
  email: "ada@example.test",
  role: "user",
  email_verified: true,
  display_name: "Ada",
  bio: "",
  created_at: "2026-07-13T12:00:00Z",
};

function video(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-07-13T12:00:00Z",
    duration_seconds: 10,
    views: 3,
    has_thumbnail: false,
  };
}

async function mockPreviewBrowse(page: Page) {
  await page.route(REFRESH, (route) =>
    route.fulfill({
      json: {
        token: "acc",
        refresh_token: "ref",
        token_type: "Bearer",
        expires_in: 900,
        user,
      },
    }),
  );
  await page.route(ME, (route) => route.fulfill({ json: user }));
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(INSTANCE, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        federation_enabled: true,
        features: {
          video_card_previews: true,
          video_card_previews_default_enabled: false,
          live: false,
          downloads: true,
        },
      },
    }),
  );
  await page.route(PLAYER_SETTINGS, (route) =>
    route.fulfill({
      json: {
        autoplay_next: true,
        default_speed: 1,
        default_quality: "auto",
        captions_default: false,
        theater_default: false,
        video_card_previews_enabled: true,
      },
    }),
  );
  await page.route(FEED, (route) =>
    route.fulfill({
      json: {
        videos: [video("v1", "Preview One"), video("v2", "Preview Two")],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(ORIGINAL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "video/mp4",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
      body: TINY_MP4,
    }),
  );
  await page.route(CAPTION_LIST, (route) =>
    route.fulfill({
      json: {
        captions: [{ language: "en", label: "English", created_at: "2026-07-13T12:00:00Z" }],
      },
    }),
  );
  await page.route(CAPTION_VTT, (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nPreview caption\n",
    }),
  );
  await page.route(STORYBOARD_VTT, (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nstoryboard.jpg#xywh=0,0,160,90\n",
    }),
  );
  await page.route(STORYBOARD_IMAGE, (route) => route.fulfill({ status: 204 }));
}

test("inline card playback is hover-intent driven, captioned, seekable, and keeps audio mode for the tab", async ({
  page,
}) => {
  await mockPreviewBrowse(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Preview One" })).toBeVisible();

  const previews = page.getByTestId("video-card-preview");
  const first = previews.nth(0);
  const second = previews.nth(1);
  const firstActions = page.getByRole("button", { name: "Actions for Preview One" });

  const actionReveal = firstActions.locator("xpath=../..");
  await expect(actionReveal).toHaveClass(/opacity-0/);
  await expect(actionReveal).toHaveClass(/group-hover\/card:opacity-100/);
  await expect(firstActions.locator("svg")).toHaveAttribute("width", "26");
  await expect(first.getByTestId("video-card-preview-media")).toHaveCount(0);

  await first.hover();
  const firstMedia = first.getByTestId("video-card-preview-media");
  await expect(firstMedia).toBeAttached();
  await expect.poll(() => firstMedia.evaluate((node: HTMLVideoElement) => node.muted)).toBe(true);
  await expect(first.getByRole("button", { name: "Hide preview captions" })).toBeVisible();
  await expect(first.getByRole("button", { name: /play/i })).toHaveCount(0);

  const timeline = first.getByRole("slider", { name: "Preview timeline" });
  const box = await timeline.boundingBox();
  if (!box) throw new Error("preview timeline has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(first.getByTestId("video-card-preview-storyboard")).toBeAttached();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect.poll(() => firstMedia.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(6);

  await first.getByRole("button", { name: "Unmute preview" }).click();
  await expect.poll(() => firstMedia.evaluate((node: HTMLVideoElement) => node.muted)).toBe(false);

  await second.hover();
  const secondMedia = second.getByTestId("video-card-preview-media");
  await expect(secondMedia).toBeAttached();
  await expect.poll(() => secondMedia.evaluate((node: HTMLVideoElement) => node.muted)).toBe(false);
  await expect(second.getByRole("button", { name: "Show preview captions" })).toBeVisible();
});
