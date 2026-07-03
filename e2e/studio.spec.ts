import { expect, test, type Page } from "@playwright/test";

// Mocked studio coverage (a real backend is not running in `npm run ci`; the
// publish/edit/delete round-trips are proven in e2e-backed/studio.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CREATE_CHANNEL = /\/api\/v1\/channels$/;
const CHANNEL_BY_HANDLE = /\/api\/v1\/channels\/ada_makes$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const UPLOAD = /\/api\/v1\/videos\/v1\/file$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const CAPTION_LANG = /\/api\/v1\/videos\/v1\/captions\/[^/]+$/;
const THUMBNAIL = /\/api\/v1\/videos\/v1\/thumbnail(\?|$)/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const CHANNEL_LIVE = /\/api\/v1\/channels\/ada_makes\/live$/;
const LIVE_ONE = /\/api\/v1\/live\/[^/]+$/;
const LIVE_KEY = /\/api\/v1\/live\/[^/]+\/key$/;

function videoConfig() {
  return {
    categories: [
      { id: "1", label: "Music" },
      { id: "7", label: "Gaming" },
    ],
    licenses: [
      { id: "1", label: "Attribution (CC BY)" },
      { id: "7", label: "Public Domain Dedication (CC0)" },
    ],
    languages: [
      { id: "en", label: "English" },
      { id: "fr", label: "French" },
    ],
    privacies: [
      { id: "public", label: "Public" },
      { id: "unlisted", label: "Unlisted" },
      { id: "private", label: "Private" },
    ],
  };
}

function channel(handle: string, name: string) {
  return {
    id: "c1",
    owner_id: "u1",
    handle,
    display_name: name,
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

test("the studio prompts anonymous viewers to sign in", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByText("Sign in to use the studio")).toBeVisible();
});

test("a creator can create a channel", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [] } }));
  await page.route(CREATE_CHANNEL, (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: channel("ada_makes", "Ada Makes") });
    return route.fulfill({ json: { channels: [] } });
  });
  // The new "Your videos" section loads the new channel's (empty) video list.
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));

  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByText("Create your first channel to start publishing.")).toBeVisible();
  await page.getByLabel("Channel handle").fill("ada_makes");
  await page.getByLabel("Channel display name").fill("Ada Makes");
  await page.getByRole("button", { name: "Create channel" }).click();

  // The new channel appears, and the upload form becomes available.
  await expect(page.getByRole("link", { name: /Ada Makes/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload a video" })).toBeVisible();
  await expect(page.getByText("No videos in this channel yet.")).toBeVisible();
});

test("a creator can edit a channel's name and description", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  let patchBody: unknown;
  await page.route(CHANNEL_BY_HANDLE, (route) => {
    patchBody = route.request().postDataJSON();
    return route.fulfill({
      json: { ...channel("ada_makes", "Ada Builds"), description: "Now with more." },
    });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("button", { name: "Edit ada_makes" }).click();
  await page.getByLabel("Edit channel name").fill("Ada Builds");
  await page.getByLabel("Edit channel description").fill("Now with more.");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("link", { name: "Ada Builds" })).toBeVisible();
  expect(patchBody).toMatchObject({ display_name: "Ada Builds", description: "Now with more." });
});

test("a creator can delete a channel", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  let deleteMethod: string | undefined;
  await page.route(CHANNEL_BY_HANDLE, (route) => {
    deleteMethod = route.request().method();
    return route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("button", { name: "Delete ada_makes" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // The only channel is gone → back to the create-your-first-channel empty state,
  // and the upload form disappears with it.
  await expect(page.getByText("Create your first channel to start publishing.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload a video" })).toHaveCount(0);
  expect(deleteMethod).toBe("DELETE");
});

test("a creator can upload and publish a video", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  // GET lists the channel's videos (the "Your videos" section); POST creates a draft.
  let draftBody: unknown;
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      draftBody = route.request().postDataJSON();
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(UPLOAD, (route) => route.fulfill({ json: { video: video() } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Video description").fill("A short description.");
  await page.getByLabel("Video category").selectOption("7");
  await page.getByLabel("Video language").selectOption("en");
  await page.getByLabel("Video license").selectOption("1");
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("Published!")).toBeVisible();
  await expect(page.getByRole("link", { name: /View .*My clip/ })).toBeVisible();
  expect(draftBody).toMatchObject({
    title: "My clip",
    description: "A short description.",
    category: "7",
    language: "en",
    license: "1",
  });
});

// The false-success regression: the upload HTTP call succeeds (201) but the
// returned video is state="failed" (probe/scan rejected the file) — the creator
// must see an error, not "Published!", and keep the form for a retry.
test("a failed upload is reported as a processing failure, not Published!", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(UPLOAD, (route) => route.fulfill({ json: { video: video({ state: "failed" }) } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not really a video"),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(
    page.getByText("Processing failed — the file could not be published", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
  // The form keeps its values so the creator can fix the file and retry.
  await expect(page.getByLabel("Video title")).toHaveValue("My clip");
});

// The same false-success guard on the URL-import path.
test("a failed URL import is reported as a processing failure, not Published!", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(/\/api\/v1\/videos\/v1\/import$/, (route) =>
    route.fulfill({ json: { video: video({ state: "failed" }) } }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("radio", { name: "Import from URL" }).check();
  await page.getByLabel("Video URL").fill("https://example.com/clip.mp4");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(
    page.getByText("Processing failed — the imported file could not be published", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
});

// An upload the backend accepts but has not finished processing must not claim
// "Published!" either — the creator sees an honest in-progress message.
test("an upload still processing shows an in-progress message, not Published!", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(UPLOAD, (route) =>
    route.fulfill({ json: { video: video({ state: "processing" }) } }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("is still processing", { exact: false })).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
});

// A 422 from the create-draft call maps its field errors inline onto the publish
// form (aria-invalid + aria-describedby), instead of one generic message.
test("a 422 field error from the draft renders inline on the title field", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 422,
        json: {
          error: {
            code: "validation_failed",
            message: "validation failed",
            fields: [{ field: "title", message: "must be at most 200 characters" }],
          },
        },
      });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("must be at most 200 characters")).toBeVisible();
  const title = page.getByLabel("Video title");
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAttribute("aria-describedby", "publish-title-error");
  // Field errors replace the generic form-level message.
  await expect(page.getByText("Upload failed. Please try again.")).toHaveCount(0);
});

// A 422 from the import call maps its url field error inline onto the URL input.
test("a 422 url field error from the import renders inline on the URL field", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(/\/api\/v1\/videos\/v1\/import$/, (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: "validation_failed",
          message: "validation failed",
          fields: [{ field: "url", message: "must be a public http(s) URL" }],
        },
      },
    }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("radio", { name: "Import from URL" }).check();
  await page.getByLabel("Video URL").fill("https://example.com/clip.mp4");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("must be a public http(s) URL")).toBeVisible();
  const url = page.getByLabel("Video URL");
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(url).toHaveAttribute("aria-describedby", "publish-url-error");
});

test("a creator can publish a video by importing from a URL", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  let importBody: unknown;
  await page.route(/\/api\/v1\/videos\/v1\/import$/, (route) => {
    importBody = route.request().postDataJSON();
    return route.fulfill({ json: { video: video() } });
  });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  // Switch the source to URL and provide a link.
  await page.getByRole("radio", { name: "Import from URL" }).check();
  await page.getByLabel("Video URL").fill("https://example.com/clip.mp4");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("Published!")).toBeVisible();
  await expect(page.getByRole("link", { name: /View .*My clip/ })).toBeVisible();
  expect(importBody).toEqual({ url: "https://example.com/clip.mp4" });
});

test("a creator can edit a video's title and privacy", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Old title", privacy: "public" })] } }),
  );
  let patchBody: unknown;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: video({ title: "New title", privacy: "unlisted" }) });
    }
    // GET: the edit form fetches the full detail to pre-fill (list lacks taxonomy).
    return route.fulfill({ json: video({ title: "Old title", privacy: "public" }) });
  });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  // Scope privacy assertions to the video row — "Public"/"Unlisted" also appear as
  // <option>s in the upload form's privacy <select>.
  const row = page.getByRole("listitem").filter({ hasText: "Old title" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Public")).toBeVisible();

  await row.getByRole("button", { name: "Edit" }).click();
  // The edit form is pre-filled from the video; description + taxonomy are editable.
  await page.getByLabel("Edit title").fill("New title");
  await page.getByLabel("Edit description").fill("Updated description.");
  await page.getByLabel("Edit category").selectOption("1");
  await page.getByLabel("Edit language").selectOption("fr");
  await page.getByLabel("Edit privacy").selectOption("unlisted");
  await page.getByRole("button", { name: "Save" }).click();

  const updatedRow = page.getByRole("listitem").filter({ hasText: "New title" });
  await expect(updatedRow.getByRole("link", { name: "New title" })).toBeVisible();
  await expect(updatedRow.getByText("Unlisted")).toBeVisible();
  expect(patchBody).toMatchObject({
    title: "New title",
    description: "Updated description.",
    category: "1",
    language: "fr",
  });
});

test("a creator can add and remove a caption from a video's edit surface", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Captioned clip" })] } }),
  );
  // The captions list starts empty; POST returns the created track.
  await page.route(CAPTIONS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        json: { language: "en", label: "English", created_at: new Date().toISOString() },
      });
    }
    return route.fulfill({ json: { captions: [] } });
  });
  await page.route(CAPTION_LANG, (route) =>
    route.request().method() === "DELETE" ? route.fulfill({ status: 204, body: "" }) : route.continue(),
  );
  // Entering edit mode fetches the video detail to pre-fill the form and the
  // taxonomy config that populates the caption-language <select>.
  await page.route(VIDEO, (route) => route.fulfill({ json: video({ title: "Captioned clip" }) }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Captioned clip" });
  await row.getByRole("button", { name: "Edit" }).click();

  // The captions manager appears (empty).
  await expect(page.getByText("No captions yet.")).toBeVisible();

  // Upload an English caption — the language comes from the curated taxonomy <select>.
  await page.getByLabel("Caption language").selectOption("en");
  await page.getByLabel("Caption label").fill("English");
  await page.getByLabel("Caption file").setInputFiles({
    name: "cap.vtt",
    mimeType: "text/vtt",
    buffer: Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n"),
  });
  const uploaded = page.waitForResponse(
    (r) => CAPTIONS.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Upload" }).click();
  await uploaded;

  await expect(page.getByText("No captions yet.")).toHaveCount(0);
  // Assert the track's Remove control rather than the "English" label, which now
  // also matches the caption-language and video-language <select> options.
  await expect(page.getByRole("button", { name: "Remove en caption" })).toBeVisible();

  // Remove it.
  const removed = page.waitForResponse(
    (r) => CAPTION_LANG.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Remove en caption" }).click();
  await removed;
  await expect(page.getByText("No captions yet.")).toBeVisible();
});

test("a creator can replace a video's thumbnail from the edit surface", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Poster clip" })] } }),
  );
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(VIDEO, (route) => route.fulfill({ json: video({ title: "Poster clip" }) }));
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.route(THUMBNAIL, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        json: {
          id: "f1",
          kind: "thumbnail",
          content_type: "image/png",
          original_name: "poster.png",
          size_bytes: 4,
          created_at: new Date().toISOString(),
        },
      });
    }
    // The <img> preview GET after upload (cache-busted src).
    return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from([137, 80, 78, 71]) });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Poster clip" });
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText("No thumbnail yet.")).toBeVisible();

  const posted = page.waitForResponse(
    (r) => THUMBNAIL.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByLabel("Thumbnail image").setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await posted;
  // The preview image now renders (cache-busted src).
  await expect(page.getByRole("img", { name: "Current thumbnail" })).toBeVisible();
});

test("a creator can create a live stream and manage its key", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  const stream = {
    id: "ls1",
    channel_id: "c1",
    title: "My Show",
    description: "",
    privacy: "public",
    state: "offline",
    permanent: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await page.route(CHANNEL_LIVE, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        json: { live_stream: stream, stream_key: "SECRET-KEY-1", rtmp_url: "rtmp://ingest/live" },
      });
    }
    return route.fulfill({ json: { live_streams: [] } });
  });
  await page.route(LIVE_KEY, (route) => route.fulfill({ json: { stream_key: "SECRET-KEY-2" } }));
  await page.route(LIVE_ONE, (route) =>
    route.request().method() === "DELETE" ? route.fulfill({ status: 204, body: "" }) : route.continue(),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Live stream title").fill("My Show");
  await page.getByRole("button", { name: "Create live stream" }).click();

  // The stream key is shown once; the row appears with an offline badge.
  await expect(page.getByLabel("Stream key")).toHaveValue("SECRET-KEY-1");
  const row = page.getByRole("listitem").filter({ hasText: "My Show" });
  await expect(row.getByText("offline")).toBeVisible();

  // Regenerate rotates the shown key.
  await row.getByRole("button", { name: "Regenerate key" }).click();
  await expect(page.getByLabel("Stream key")).toHaveValue("SECRET-KEY-2");

  // Delete removes the row.
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "My Show" })).toHaveCount(0);
});

test("the live streams list reloads state", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  const base = {
    id: "ls1",
    channel_id: "c1",
    title: "My Show",
    description: "",
    privacy: "public",
    permanent: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let calls = 0;
  await page.route(CHANNEL_LIVE, (route) => {
    calls += 1;
    return route.fulfill({
      json: { live_streams: [{ ...base, state: calls === 1 ? "offline" : "live" }] },
    });
  });

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "My Show" });
  await expect(row.getByText("offline")).toBeVisible();
  // Reload re-reads the state → the badge flips to live.
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(row.getByText("live", { exact: true })).toBeVisible();
});

test("a creator can delete a video", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Doomed clip" })] } }),
  );
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204 });
    return route.continue();
  });

  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("link", { name: "Doomed clip" })).toBeVisible();

  // Scope to the video row — the channel row also has a Delete control now.
  const row = page.getByRole("listitem").filter({ hasText: "Doomed clip" });
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByRole("link", { name: "Doomed clip" })).toHaveCount(0);
  await expect(page.getByText("No videos in this channel yet.")).toBeVisible();
});
