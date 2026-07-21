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
const CHANNEL_MEMBERS = /\/api\/v1\/channels\/ada_makes\/members$/;
const CHANNEL_MEMBER_ONE = /\/api\/v1\/channels\/ada_makes\/members\/[^/]+$/;
const ATPROTO = /\/api\/v1\/me\/atproto$/;
// Resumable (chunked) upload protocol endpoints.
const UPLOAD_SESSION = /\/api\/v1\/videos\/v1\/upload-session$/;
const CHUNK = /\/api\/v1\/uploads\/up1\/chunks\/\d+$/;
const COMPLETE = /\/api\/v1\/uploads\/up1\/complete$/;
const SESSION = /\/api\/v1\/uploads\/up1$/;
const IMPORT = /\/api\/v1\/videos\/v1\/import$/;
const VIDEO = /\/api\/v1\/videos\/v1$/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const CAPTION_LANG = /\/api\/v1\/videos\/v1\/captions\/[^/]+$/;
const AUTO_CAPTION = /\/api\/v1\/videos\/v1\/captions\/auto$/;
const CHAPTERS = /\/api\/v1\/videos\/v1\/chapters$/;
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
    remote: false,
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    is_sensitive: false,
    ...overrides,
  };
}

const FUTURE = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

function importJob(state: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "job1",
    video_id: "v1",
    state,
    // resolver is required on the ImportJob contract; starts "auto" until the
    // worker rewrites it to the concrete mechanism it ran.
    resolver: "auto",
    attempts: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function captionJob(state: string, overrides: Record<string, unknown> = {}) {
  return {
    caption_job: {
      id: "cj1",
      video_id: "v1",
      language: "en",
      state,
      attempts: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    },
  };
}

// mockChunkedUpload wires the resumable-upload protocol so a studio file upload
// completes: open session → PUT each chunk → complete returns `completeJson`.
// Small test files fit one chunk (chunk_size defaults large).
async function mockChunkedUpload(
  page: Page,
  completeJson: Record<string, unknown>,
  opts: { total?: number; chunkSize?: number; size?: number } = {},
) {
  const total = opts.total ?? 1;
  const chunkSize = opts.chunkSize ?? 1_048_576;
  const size = opts.size ?? 4;
  await page.route(UPLOAD_SESSION, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 201,
          json: { upload_id: "up1", chunk_size: chunkSize, total_chunks: total, size, expires_at: FUTURE },
        })
      : route.continue(),
  );
  const received: number[] = [];
  await page.route(CHUNK, (route) => {
    const n = Number(/\/chunks\/(\d+)$/.exec(route.request().url())![1]);
    received.push(n);
    return route.fulfill({
      status: 200,
      json: {
        upload_id: "up1",
        video_id: "v1",
        state: "active",
        size,
        chunk_size: chunkSize,
        total_chunks: total,
        received_chunks: [...new Set(received)].sort((a, b) => a - b),
        bytes_received: size,
        expires_at: FUTURE,
      },
    });
  });
  await page.route(COMPLETE, (route) => route.fulfill({ status: 201, json: completeJson }));
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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// The upload form opens in the stepped "Upload video" sheet. openUpload launches
// it. Selecting a FILE now auto-advances to the details stage AND auto-starts the
// upload (no Continue) — pickFile just sets the input. The URL path still uses an
// explicit Continue.
async function openUpload(page: Page) {
  await page.getByRole("button", { name: "Upload video" }).click();
}
async function pickFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel("Video file").setInputFiles(file);
}
async function pickUrl(page: Page, url: string) {
  await page.getByRole("button", { name: "Import from URL" }).click();
  await page.getByLabel("Video URL").fill(url);
  await page.getByRole("button", { name: "Continue" }).click();
}

// The studio is now split into per-surface tabs under a shared shell. Reaching a
// surface is a two-step client nav (which preserves the in-memory session): the
// sidebar "Studio" link → the dashboard, then the StudioNav tab strip → the
// target surface. gotoStudioTab does both.
async function gotoStudioTab(page: Page, tab: "Dashboard" | "Content" | "Live" | "Analytics" | "Channel") {
  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("link", { name: tab, exact: true }).click();
}

// The desktop header "+ Create" menu is the real creator entry point: each row is
// a deep link into the studio surface that auto-opens the flow (?upload=1 /
// ?new=1 / ?create=1). Clicking it client-navigates (preserving the in-memory
// session), so createMenu exercises the actual auto-open, not just the href.
async function createMenu(page: Page, item: "Upload video" | "Go live" | "New channel") {
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("menu", { name: "Create" }).getByRole("menuitem", { name: item }).click();
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
  await page.route(CHANNEL_MEMBERS, (route) => route.fulfill({ json: { members: [] } }));
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );

  await gotoStudioTab(page, "Channel");
  // Zero channels → the Channel tab's onboarding create form.
  await expect(page.getByText("Create your first channel")).toBeVisible();
  await page.getByLabel("Channel handle").fill("ada_makes");
  await page.getByLabel("Channel display name").fill("Ada Makes");
  await page.getByRole("button", { name: "Create channel" }).click();

  // The new channel becomes the current one → its management panel appears.
  await expect(page.getByRole("heading", { name: "Channel details" })).toBeVisible();
  await expect(page.getByLabel("Edit channel name")).toHaveValue("Ada Makes");
});

test("a creator can edit a channel's name and description", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CHANNEL_MEMBERS, (route) => route.fulfill({ json: { members: [] } }));
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );
  let patchBody: unknown;
  await page.route(CHANNEL_BY_HANDLE, (route) => {
    patchBody = route.request().postDataJSON();
    return route.fulfill({
      json: { ...channel("ada_makes", "Ada Builds"), description: "Now with more." },
    });
  });

  await gotoStudioTab(page, "Channel");
  // The Channel tab edits the current channel directly (no per-row Edit toggle).
  await page.getByLabel("Edit channel name").fill("Ada Builds");
  await page.getByLabel("Edit channel description").fill("Now with more.");
  await page.getByRole("button", { name: "Save changes" }).click();

  // The saved name flows into the channel identity in the studio nav switcher.
  await expect(page.getByText("Ada Builds")).toBeVisible();
  expect(patchBody).toMatchObject({ display_name: "Ada Builds", description: "Now with more." });
});

test("a creator can delete a channel", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CHANNEL_MEMBERS, (route) => route.fulfill({ json: { members: [] } }));
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );
  let deleteMethod: string | undefined;
  await page.route(CHANNEL_BY_HANDLE, (route) => {
    deleteMethod = route.request().method();
    return route.fulfill({ status: 204, body: "" });
  });

  await gotoStudioTab(page, "Channel");
  await page.getByRole("button", { name: "Delete ada_makes" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // The only channel is gone → back to the create-your-first-channel onboarding.
  await expect(page.getByText("Create your first channel")).toBeVisible();
  expect(deleteMethod).toBe("DELETE");
});

// A channel carrying the per-channel protocol flags + the caller's owner role.
function ownedChannel(overrides: Record<string, unknown> = {}) {
  return {
    ...channel("ada_makes", "Ada Makes"),
    role: "owner",
    activitypub_enabled: true,
    atproto_enabled: true,
    atproto_active: false,
    ...overrides,
  };
}

test("an owner toggles ActivityPub federation on the Channel tab (PATCH)", async ({ page }) => {
  await signIn(page);
  const ch = ownedChannel();
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [ch] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CHANNEL_MEMBERS, (route) => route.fulfill({ json: { members: [] } }));
  // A linked Bluesky account → the ATProto row shows a live toggle (not the CTA).
  await page.route(ATPROTO, (route) => route.fulfill({ json: { handle: "ada.bsky.social" } }));
  let patchBody: unknown;
  await page.route(CHANNEL_BY_HANDLE, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...ch, activitypub_enabled: false } });
    }
    return route.fulfill({ json: ch });
  });

  await gotoStudioTab(page, "Channel");
  const dist = page.getByRole("region", { name: "Distribution" });
  const ap = dist.getByRole("switch", { name: "Federate this channel over ActivityPub" });
  await expect(ap).toHaveAttribute("aria-checked", "true");
  // The linked account exposes the ATProto toggle too.
  await expect(dist.getByRole("switch", { name: "Cross-post this channel to Bluesky" })).toBeVisible();

  await ap.click();
  await expect(ap).toHaveAttribute("aria-checked", "false");
  expect(patchBody).toMatchObject({ activitypub_enabled: false });
});

test("an owner without a linked Bluesky account sees the connect CTA", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [ownedChannel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CHANNEL_MEMBERS, (route) => route.fulfill({ json: { members: [] } }));
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no account" } } }),
  );

  await gotoStudioTab(page, "Channel");
  const dist = page.getByRole("region", { name: "Distribution" });
  await expect(dist.getByRole("link", { name: "Link your Bluesky account" })).toHaveAttribute(
    "href",
    "/settings/connections",
  );
  await expect(dist.getByRole("switch", { name: "Cross-post this channel to Bluesky" })).toHaveCount(0);
});

test("an owner invites and removes a channel collaborator", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [ownedChannel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  // The instance ATProto extension is off → the distribution ATProto row is hidden.
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );
  let members: Array<Record<string, unknown>> = [];
  await page.route(CHANNEL_MEMBERS, (route) => {
    if (route.request().method() === "POST") {
      const m = {
        user_id: "u2",
        username: "bob",
        display_name: "Bob",
        role: "editor",
        created_at: new Date().toISOString(),
      };
      members = [m];
      return route.fulfill({ status: 201, json: m });
    }
    return route.fulfill({ json: { members } });
  });
  await page.route(CHANNEL_MEMBER_ONE, (route) =>
    route.request().method() === "DELETE" ? route.fulfill({ status: 204, body: "" }) : route.continue(),
  );

  await gotoStudioTab(page, "Channel");
  const collab = page.getByRole("region", { name: "Collaborators" });
  await expect(collab.getByText("No collaborators yet.")).toBeVisible();

  await collab.getByLabel("Collaborator handle").fill("bob");
  await collab.getByRole("button", { name: "Add editor" }).click();
  await expect(collab.getByText(/@bob/)).toBeVisible();

  await collab.getByRole("button", { name: "Remove bob" }).click();
  await collab.getByRole("button", { name: "Confirm" }).click();
  await expect(collab.getByText("No collaborators yet.")).toBeVisible();
});

test("an editor sees a read-only Channel tab and read-only collaborators", async ({ page }) => {
  await signIn(page);
  const shared = ownedChannel({ role: "editor" });
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [shared] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );
  await page.route(CHANNEL_MEMBERS, (route) =>
    route.fulfill({
      json: {
        members: [
          {
            user_id: "u1",
            username: "ada",
            display_name: "Ada",
            role: "editor",
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );

  await gotoStudioTab(page, "Channel");
  // Read-only identity note; no edit form, no distribution toggles, no danger zone.
  await expect(page.getByText("You’re an editor of this channel.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Edit channel name")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Federate this channel over ActivityPub" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete ada_makes" })).toHaveCount(0);
  // The collaborator list is visible but read-only (no invite form / remove).
  const collab = page.getByRole("region", { name: "Collaborators" });
  await expect(collab.getByText(/@ada/)).toBeVisible();
  await expect(collab.getByLabel("Collaborator handle")).toHaveCount(0);
});

// The "+ Create" deep links auto-open their flow on the target surface, then
// strip the query param — the behavior the header menu / mobile sheet / dashboard
// quick actions all rely on. These assert the real modal appears (not just the
// href), navigating client-side from the header menu.
test("the Create menu opens the upload sheet on the content tab and strips ?upload=1", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await createMenu(page, "Upload video");

  // The stepped upload sheet is up…
  await expect(page.getByRole("dialog", { name: "Upload video" })).toBeVisible();
  await expect(page.getByLabel("Video file")).toBeVisible();
  // …and the deep-link param is stripped once consumed.
  await expect(page).toHaveURL(/\/studio\/content$/);
});

test("the Create menu opens the go-live modal on the live tab and strips ?new=1", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_LIVE, (route) => route.fulfill({ json: { live_streams: [] } }));

  await createMenu(page, "Go live");

  await expect(page.getByRole("dialog", { name: "Go live" })).toBeVisible();
  await expect(page.getByLabel("Live stream title")).toBeVisible();
  await expect(page).toHaveURL(/\/studio\/live$/);
});

test("the Create menu opens the create-channel dialog on the channel tab (?create=1)", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [ownedChannel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CHANNEL_MEMBERS, (route) => route.fulfill({ json: { members: [] } }));
  await page.route(ATPROTO, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );

  await createMenu(page, "New channel");

  await expect(page.getByRole("dialog", { name: "Create a channel" })).toBeVisible();
  await expect(page.getByLabel("Channel handle")).toBeVisible();
});

// Regression: the upload auto-open used a one-shot-per-mount guard, so triggering
// "+ Create → Upload video" while ALREADY on /studio/content did nothing and left
// ?upload=1 stuck. Every fresh appearance of the param must reopen the sheet.
test("re-triggering Upload video while already on the content tab reopens the sheet", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  // Land on the content tab with the sheet auto-opened, then close it.
  await createMenu(page, "Upload video");
  const sheet = page.getByRole("dialog", { name: "Upload video" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/studio\/content$/);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // Re-trigger the same deep link from the header while already on the tab — the
  // sheet must reopen and the param strip again.
  await createMenu(page, "Upload video");
  await expect(page.getByRole("dialog", { name: "Upload video" })).toBeVisible();
  await expect(page).toHaveURL(/\/studio\/content$/);
});

test("a creator can upload and publish a video", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  // GET lists the channel's videos; POST auto-creates the private draft on file
  // select (title only); PATCH applies the metadata at Publish.
  let draftBody: unknown;
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      draftBody = route.request().postDataJSON();
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  let patchBody: unknown;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: video() });
    }
    return route.continue();
  });
  await mockChunkedUpload(page, { video: video() });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // Selecting the file auto-starts the upload: a title-only, explicitly private
  // draft, then the resumable transfer. It finalises to the "Uploaded" file-card
  // state (the mocked chunk completes at once), all before any Publish.
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();
  // The title prefilled from the filename; the creator overrides it + fills the rest.
  await expect(page.getByLabel("Video title")).toHaveValue("clip");
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Video description").fill("A short description.");
  await page.getByLabel("Video category").selectOption("7");
  await page.getByLabel("Video language").selectOption("en");
  await page.getByLabel("Video license").selectOption("1");
  await page.getByRole("switch", { name: "Contains sensitive content" }).click();
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("Published!")).toBeVisible();
  await expect(page.getByRole("link", { name: /View .*My clip/ })).toBeVisible();
  // The auto-create carried ONLY the filename title + explicit private.
  expect(draftBody).toEqual({ title: "clip", privacy: "private" });
  // The typed metadata travelled on the Publish PATCH.
  expect(patchBody).toMatchObject({
    title: "My clip",
    description: "A short description.",
    category: "7",
    language: "en",
    license: "1",
    is_sensitive: true,
  });
});

test("an upload the backend rejects as too large shows a friendly size message", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: video({ state: "draft" }) })
      : route.fulfill({ json: { videos: [] } }),
  );
  // The backend refuses the upload session because the file exceeds the size cap.
  await page.route(UPLOAD_SESSION, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 413,
          json: {
            error: {
              code: "request_entity_too_large",
              message: "file exceeds the maximum allowed size",
            },
          },
        })
      : route.continue(),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // The auto-started upload opens the session, which the backend refuses (413) —
  // the friendly size error surfaces on select, with a Retry (no Publish needed).
  await pickFile(page, { name: "huge.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });

  await expect(page.getByText("That file is too large.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry upload" })).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
});

test("publish sends the entered tags, normalized, on the draft", async ({ page }) => {
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
  let patchBody: unknown;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: video() });
    }
    return route.continue();
  });
  await mockChunkedUpload(page, { video: video() });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });
  await page.getByLabel("Video title").fill("Tagged clip");
  const tagsField = page.getByLabel("Video tags");
  // Enter commits; a comma commits too (paste-friendly); values are lowercased
  // and deduped, capped at 5.
  await tagsField.fill("Retro");
  await tagsField.press("Enter");
  await tagsField.fill("GAMING, retro");
  await tagsField.press("Enter");
  await expect(page.getByRole("button", { name: "Remove tag retro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag gaming" })).toBeVisible();
  // A removed chip does not travel with the publish.
  await tagsField.fill("typo");
  await tagsField.press("Enter");
  await page.getByRole("button", { name: "Remove tag typo" }).click();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published!")).toBeVisible();
  expect(patchBody).toMatchObject({ title: "Tagged clip", tags: ["retro", "gaming"] });
});

test("editing tags sends the replaced set on the PATCH", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Tagged clip" })] } }),
  );
  let patchBody: unknown;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: video({ title: "Tagged clip", tags: ["fresh", "retro"] }) });
    }
    // GET: the edit form fetches the full detail — the only view carrying tags.
    return route.fulfill({ json: video({ title: "Tagged clip", tags: ["old", "retro"] }) });
  });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  const row = page.getByRole("listitem").filter({ hasText: "Tagged clip" });
  await row.getByRole("button", { name: "Edit" }).click();

  // Pre-filled from the detail; replace "old" with "fresh".
  await expect(page.getByRole("button", { name: "Remove tag old" })).toBeVisible();
  await page.getByRole("button", { name: "Remove tag old" }).click();
  const tagsField = page.getByLabel("Edit tags");
  await tagsField.fill("fresh");
  await tagsField.press("Enter");
  await page.getByRole("switch", { name: "Edit contains sensitive content" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(row.getByRole("button", { name: "Edit" })).toBeVisible();
  expect(patchBody).toMatchObject({ tags: ["retro", "fresh"], is_sensitive: true });
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
  await mockChunkedUpload(page, { video: video({ state: "failed" }) });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // The upload auto-completes as state="failed" (probe/scan rejected it) — the
  // honest error surfaces right after select, never "Published!".
  await pickFile(page, {
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not really a video"),
  });

  await expect(
    page.getByText("Processing failed — the file could not be published", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
  // The picked file + its prefilled title are kept for a retry.
  await expect(page.getByLabel("Video title")).toHaveValue("clip");
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
  // POST enqueues (202 running); the poll then reports the job failed.
  await page.route(IMPORT, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 202, json: { import_job: importJob("running") } })
      : route.fulfill({ json: { import_job: importJob("failed") } }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickUrl(page, "https://example.com/clip.mp4");
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(
    page.getByText("Processing failed — the imported file could not be published", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
});

// The async URL import surfaces the backend's safe failure reason when the job
// comes back failed with an `error` message.
test("a failed URL import surfaces the job's error reason", async ({ page }) => {
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
  await page.route(IMPORT, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 202, json: { import_job: importJob("pending") } })
      : route.fulfill({
          json: { import_job: importJob("failed", { error: "the source returned 404 Not Found" }) },
        }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickUrl(page, "https://example.com/missing.mp4");
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("the source returned 404 Not Found")).toBeVisible();
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
  await mockChunkedUpload(page, { video: video({ state: "processing" }) });
  await page.route(VIDEO, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ json: video({ state: "processing" }) })
      : route.continue(),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("is still processing", { exact: false })).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
});

// P6.2 chunked upload progress + cancellation: while a (mocked, held-open) chunk
// upload is in flight the form shows a determinate progress bar (role=progressbar
// with aria-valuenow) + percent + a Cancel control; cancelling aborts the chunk
// transfer, DELETEs the upload session (dropping its chunks) AND the orphaned
// draft video, and returns the form to an editable state with its values kept.
test("a slow upload shows a determinate progress bar and can be cancelled", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  // The session opens immediately.
  await page.route(UPLOAD_SESSION, (route) =>
    route.fulfill({
      status: 201,
      json: { upload_id: "up1", chunk_size: 1_048_576, total_chunks: 1, size: 4, expires_at: FUTURE },
    }),
  );
  // Cancel → DELETE the session (drops the chunk blobs).
  let sessionCancelled = false;
  await page.route(SESSION, (route) => {
    if (route.request().method() === "DELETE") {
      sessionCancelled = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
  // Cleanup DELETE for the orphaned draft.
  let draftDeleted = false;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "DELETE") {
      draftDeleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
  // Hold the chunk PUT open so the in-flight UI is observable; the fetch is
  // aborted by Cancel long before this fulfils (the catch absorbs the abort).
  await page.route(CHUNK, async (route) => {
    await new Promise((r) => setTimeout(r, 5_000));
    await route
      .fulfill({
        status: 200,
        json: {
          upload_id: "up1",
          video_id: "v1",
          state: "active",
          size: 4,
          chunk_size: 1_048_576,
          total_chunks: 1,
          received_chunks: [0],
          bytes_received: 4,
          expires_at: FUTURE,
        },
      })
      .catch(() => {});
  });

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // Selecting the file auto-starts the upload — the determinate progress bar +
  // percent + Cancel are up while the held chunk keeps it in flight.
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });

  const bar = page.getByRole("progressbar", { name: "Upload progress" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", /^\d+$/);
  // Publish stays enabled during the upload (metadata can be queued) — it does not
  // read "Uploading…" anymore.
  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();

  await page.getByRole("button", { name: "Cancel upload" }).click();

  // Back to the pick step with the cancelled note, no progress bar, no success.
  await expect(page.getByText("Upload cancelled", { exact: false })).toBeVisible();
  await expect(bar).toHaveCount(0);
  await expect(page.getByLabel("Video file")).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);

  // The session was cancelled and the orphaned draft best-effort deleted.
  await expect.poll(() => sessionCancelled).toBe(true);
  await expect.poll(() => draftDeleted).toBe(true);
});

// The resume affordance: an interrupted upload leaves a resumable session in
// localStorage; re-picking the SAME file (matched by name + size) offers "Resume
// upload", which reads the session's received chunks, PUTs only the missing ones,
// and completes — without re-creating the draft or re-uploading landed chunks.
test("a re-picked file offers Resume and finishes the interrupted upload", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  // Seed a resumable session for a 10-byte "clip.mp4" (chunk 0 already landed) —
  // set on the current (post-login) page so it survives the client-side nav to
  // the studio (an interrupted upload would have left exactly this record).
  await page.evaluate((future) => {
    localStorage.setItem(
      "vidra.upload-sessions",
      JSON.stringify([
        { uploadId: "up1", videoId: "v1", filename: "clip.mp4", size: 10, expiresAt: future },
      ]),
    );
  }, FUTURE);

  // GET the session status → active, chunk 0 received (of 3).
  await page.route(SESSION, (route) =>
    route.fulfill({
      json: {
        upload_id: "up1",
        video_id: "v1",
        state: "active",
        size: 10,
        chunk_size: 4,
        total_chunks: 3,
        received_chunks: [0],
        bytes_received: 4,
        expires_at: FUTURE,
      },
    }),
  );
  const putChunks: number[] = [];
  await page.route(CHUNK, (route) => {
    const n = Number(/\/chunks\/(\d+)$/.exec(route.request().url())![1]);
    putChunks.push(n);
    return route.fulfill({
      status: 200,
      json: {
        upload_id: "up1",
        video_id: "v1",
        state: "active",
        size: 10,
        chunk_size: 4,
        total_chunks: 3,
        received_chunks: [...new Set([0, ...putChunks])].sort((a, b) => a - b),
        bytes_received: n === 2 ? 10 : (n + 1) * 4,
        expires_at: FUTURE,
      },
    });
  });
  await page.route(COMPLETE, (route) => route.fulfill({ status: 201, json: { video: video() } }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // Re-pick the same 10-byte clip.mp4 on the pick stage → the resume banner
  // appears (resume reuses the existing draft, so no title/details entry).
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(10),
  });
  await expect(page.getByText("Unfinished upload found for “clip.mp4”", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Resume upload" }).click();
  await expect(page.getByText("Published!")).toBeVisible();
  // Only the missing chunks (1 and 2) were PUT — chunk 0 was skipped.
  expect(putChunks.sort((a, b) => a - b)).toEqual([1, 2]);
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

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // The auto draft-create is rejected 422 — its field error maps inline onto the
  // title field right after select (no Publish needed).
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });

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

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickUrl(page, "https://example.com/clip.mp4");
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Publish" }).click();

  // A url field error bounces the sheet back to the pick stage where the URL
  // input lives, so the inline message renders next to it.
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
  // POST enqueues (202, running); the poll then reports done, and the finalised
  // video is read back via GET /videos/v1.
  let importBody: unknown;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      importBody = route.request().postDataJSON();
      return route.fulfill({ status: 202, json: { import_job: importJob("running") } });
    }
    return route.fulfill({ json: { import_job: importJob("done") } });
  });
  await page.route(VIDEO, (route) => route.fulfill({ json: video() }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  // Switch the source to URL, provide a link, then add details and publish.
  await pickUrl(page, "https://example.com/clip.mp4");
  await page.getByLabel("Video title").fill("My clip");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("Published!")).toBeVisible();
  await expect(page.getByRole("link", { name: /View .*My clip/ })).toBeVisible();
  expect(importBody).toEqual({ url: "https://example.com/clip.mp4", resolver: "auto" });
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

  await gotoStudioTab(page, "Content");
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
  await page.getByRole("button", { name: "Save", exact: true }).click();

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

test("the edit surface lists the ready HLS renditions for a transcoded video", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [video()] } }));
  // The DETAIL is the only view carrying hls_url/renditions (per the contract),
  // which the edit surface fetches — that is where the streaming note lives.
  await page.route(VIDEO, (route) =>
    route.fulfill({
      json: video({
        hls_url: "/api/v1/videos/v1/hls/master.m3u8",
        renditions: [
          { height: 720, width: 1280 },
          { height: 480, width: 854 },
        ],
      }),
    }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  // Scope to the video row — the channel row has its own Edit button.
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Streaming (HLS) ready: 720p, 480p.")).toBeVisible();
});

test("the edit surface notes when a published video's HD versions are not ready", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [video()] } }));
  // Published but no hls_url on the detail: transcoding pending/failed/disabled —
  // the contract exposes only this presence signal, so the note stays hedged.
  await page.route(VIDEO, (route) => route.fulfill({ json: video() }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  // Scope to the video row — the channel row has its own Edit button.
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByText(
      "HD streaming versions are not ready — viewers currently watch the original file",
      { exact: false },
    ),
  ).toBeVisible();
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

  await gotoStudioTab(page, "Content");
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
  await page.getByRole("button", { name: "Upload", exact: true }).click();
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

test("a creator can add, validate, and save chapters from the edit surface", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Chaptered clip", duration_seconds: 600 })] } }),
  );
  // The edit form fetches the detail (carries duration_seconds → the "before the
  // end" check) and the taxonomy config.
  await page.route(VIDEO, (route) =>
    route.fulfill({ json: video({ title: "Chaptered clip", duration_seconds: 600 }) }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));
  // Chapters start empty; the PUT echoes back the stored set.
  let putBody: unknown;
  await page.route(CHAPTERS, (route) => {
    if (route.request().method() === "PUT") {
      putBody = route.request().postDataJSON();
      return route.fulfill({
        json: {
          chapters: [
            { start_seconds: 0, title: "Intro" },
            { start_seconds: 90, title: "Deep dive" },
          ],
        },
      });
    }
    return route.fulfill({ json: { chapters: [] } });
  });

  await gotoStudioTab(page, "Content");
  const row = page.getByRole("listitem").filter({ hasText: "Chaptered clip" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();

  // The chapters editor mounts, empty.
  await expect(page.getByText("No chapters yet.")).toBeVisible();

  // A bad time + a blank title block the save with inline errors (no PUT).
  await page.getByRole("button", { name: "Add chapter" }).click();
  await page.getByLabel("Chapter 1 start").fill("oops");
  await page.getByRole("button", { name: "Save chapters" }).click();
  await expect(page.getByText("Enter a time like 1:30.")).toBeVisible();
  await expect(page.getByText("Add a chapter title.")).toBeVisible();

  // Fix row 1, add row 2, then save → the PUT carries the parsed, whole set.
  await page.getByLabel("Chapter 1 start").fill("0:00");
  await page.getByLabel("Chapter 1 title").fill("Intro");
  await page.getByRole("button", { name: "Add chapter" }).click();
  await page.getByLabel("Chapter 2 start").fill("1:30");
  await page.getByLabel("Chapter 2 title").fill("Deep dive");
  const saved = page.waitForResponse(
    (r) => CHAPTERS.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("button", { name: "Save chapters" }).click();
  await saved;

  await expect(page.getByText("Chapters saved.")).toBeVisible();
  expect(putBody).toEqual({
    chapters: [
      { start_seconds: 0, title: "Intro" },
      { start_seconds: 90, title: "Deep dive" },
    ],
  });
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

  await gotoStudioTab(page, "Content");
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

  await gotoStudioTab(page, "Live");
  // The create form is now a launched Modal (opened by "Go live").
  await page.getByRole("button", { name: "Go live" }).click();
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

  await gotoStudioTab(page, "Live");
  const row = page.getByRole("listitem").filter({ hasText: "My Show" });
  await expect(row.getByText("offline")).toBeVisible();
  // Reload re-reads the state → the badge flips to live.
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(row.getByText("live", { exact: true })).toBeVisible();
});

test("a creator can enable 'save replay as a video' when creating a live stream", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  const created = {
    id: "ls1",
    channel_id: "c1",
    title: "Replay Show",
    description: "",
    privacy: "public",
    state: "offline",
    permanent: false,
    replay_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await page.route(CHANNEL_LIVE, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        json: { live_stream: created, stream_key: "SECRET-KEY-1", rtmp_url: "rtmp://ingest/live" },
      });
    }
    return route.fulfill({ json: { live_streams: [] } });
  });

  await gotoStudioTab(page, "Live");
  await page.getByRole("button", { name: "Go live" }).click();
  await page.getByLabel("Live stream title").fill("Replay Show");
  // Save replay is now a Toggle (role=switch); click it on (not .check(), which
  // Playwright reserves for checkbox/radio inputs).
  await page.getByLabel("Save replay as a video").click();

  // The create POST carries replay_enabled: true.
  const createReq = page.waitForRequest(
    (r) => CHANNEL_LIVE.test(r.url()) && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Create live stream" }).click();
  const req = await createReq;
  expect(req.postDataJSON()).toMatchObject({ title: "Replay Show", replay_enabled: true });

  // The created row shows the replay toggle checked (mirrors the persisted stream).
  const row = page.getByRole("listitem").filter({ hasText: "Replay Show" });
  await expect(row.getByLabel("Save replay as a video for Replay Show")).toBeChecked();
});

test("a creator toggles replay on an existing stream (PATCH)", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  const stream = {
    id: "ls1",
    channel_id: "c1",
    title: "Toggle Show",
    description: "",
    privacy: "public",
    state: "offline",
    permanent: false,
    replay_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await page.route(CHANNEL_LIVE, (route) =>
    route.fulfill({ json: { live_streams: [stream] } }),
  );
  // PATCH /live/ls1 flips replay_enabled and echoes the updated stream.
  await page.route(LIVE_ONE, (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { replay_enabled?: boolean };
      return route.fulfill({ json: { ...stream, replay_enabled: Boolean(body.replay_enabled) } });
    }
    return route.continue();
  });

  await gotoStudioTab(page, "Live");
  const row = page.getByRole("listitem").filter({ hasText: "Toggle Show" });
  const toggle = row.getByLabel("Save replay as a video for Toggle Show");
  await expect(toggle).not.toBeChecked();

  const patched = page.waitForResponse(
    (r) => LIVE_ONE.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  // A single click (not .check(), which would retry-click a controlled checkbox
  // whose state only flips once the async PATCH resolves — double-toggling it).
  await toggle.click();
  await patched;
  await expect(toggle).toBeChecked();
});

// Shared setup for the auto-caption (Whisper) tests: sign in, one video, enter
// its edit surface (which mounts the CaptionsManager).
async function openVideoEditForCaptions(page: Page) {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Autocap clip" })] } }),
  );
  await page.route(VIDEO, (route) => route.fulfill({ json: video({ title: "Autocap clip" }) }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  const row = page.getByRole("listitem").filter({ hasText: "Autocap clip" });
  await row.getByRole("button", { name: "Edit" }).click();
}

test("a creator generates automatic captions and the track appears after polling", async ({
  page,
}) => {
  // The captions list is empty until the auto-caption job completes, then returns
  // the generated track. The status endpoint reports running once, then done.
  let autoGets = 0;
  let done = false;
  await page.route(CAPTIONS, (route) =>
    route.fulfill({
      json: {
        captions: done
          ? [{ language: "en", label: "English (auto)", created_at: new Date().toISOString() }]
          : [],
      },
    }),
  );
  await page.route(AUTO_CAPTION, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 202, json: captionJob("pending") });
    }
    autoGets += 1;
    const state = autoGets >= 2 ? "done" : "running";
    if (state === "done") done = true;
    return route.fulfill({ json: captionJob(state) });
  });

  await openVideoEditForCaptions(page);
  await expect(page.getByText("No captions yet.")).toBeVisible();

  // Pick a language hint and request auto-captioning.
  await page.getByLabel("Transcription language").selectOption("en");
  const posted = page.waitForResponse(
    (r) => AUTO_CAPTION.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Generate automatically" }).click();
  await posted;

  // It reports progress while the job runs…
  await expect(page.getByText("Generating captions…", { exact: false })).toBeVisible();

  // …then the poll sees "done", the list refreshes, and the track appears.
  await expect(page.getByText("Automatic captions added.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Remove en caption" })).toBeVisible();
});

test("auto-captioning is disabled with an explanation when the server doesn't support it", async ({
  page,
}) => {
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  // The server has auto-captioning turned off → 503.
  await page.route(AUTO_CAPTION, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: { code: "unavailable", message: "auto-captioning disabled" } },
        })
      : route.fulfill({ json: captionJob("pending") }),
  );

  await openVideoEditForCaptions(page);
  await page.getByRole("button", { name: "Generate automatically" }).click();

  // The control is replaced by an explanation; the button is gone.
  await expect(page.getByText("Automatic captions aren't available on this server.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate automatically" })).toHaveCount(0);
});

test("a 409 (a job already running) still polls through to the finished track", async ({
  page,
}) => {
  let autoGets = 0;
  let done = false;
  await page.route(CAPTIONS, (route) =>
    route.fulfill({
      json: {
        captions: done
          ? [{ language: "en", label: "English (auto)", created_at: new Date().toISOString() }]
          : [],
      },
    }),
  );
  await page.route(AUTO_CAPTION, (route) => {
    if (route.request().method() === "POST") {
      // A job is already in flight for this video.
      return route.fulfill({
        status: 409,
        json: { error: { code: "conflict", message: "already running" } },
      });
    }
    autoGets += 1;
    const state = autoGets >= 2 ? "done" : "running";
    if (state === "done") done = true;
    return route.fulfill({ json: captionJob(state) });
  });

  await openVideoEditForCaptions(page);
  await page.getByRole("button", { name: "Generate automatically" }).click();

  // Despite the 409, we follow the in-flight job to completion.
  await expect(page.getByText("Automatic captions added.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Remove en caption" })).toBeVisible();
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

  await gotoStudioTab(page, "Content");
  await expect(page.getByRole("link", { name: "Doomed clip" })).toBeVisible();

  // Scope to the video row — the channel row also has a Delete control now.
  const row = page.getByRole("listitem").filter({ hasText: "Doomed clip" });
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByRole("link", { name: "Doomed clip" })).toHaveCount(0);
  await expect(page.getByText("No videos in this channel yet.")).toBeVisible();
});

test("the upload form prefills from the instance publish defaults and sends the policies (W9)", async ({
  page,
}) => {
  // The operator's defaults.publish block seeds the publish form: privacy,
  // licence preselection, and the per-video comment/download toggles.
  await page.route(/\/api\/v1\/instance$/, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        features: { uploads: true, imports: true, live: false, comments: true, downloads: true },
        defaults: {
          feed_sort: "recent",
          feed_scope: "local",
          landing_page: "home-recent",
          theme: "system",
          player_autoplay: true,
          miniature_prefer_author_display_name: false,
          publish: {
            privacy: "unlisted",
            licence: 7,
            comment_policy: "disabled",
            download_enabled: false,
          },
        },
      },
    }),
  );
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
  let patchBody: Record<string, unknown> | undefined;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: video() });
    }
    return route.continue();
  });
  await mockChunkedUpload(page, { video: video() });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });

  // Prefilled from defaults.publish (licence 7 exists in the config mock).
  await expect(page.getByLabel("Privacy", { exact: true })).toHaveValue("unlisted");
  await expect(page.getByLabel("Video license")).toHaveValue("7");
  await expect(page.getByRole("switch", { name: "Allow comments" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(page.getByRole("switch", { name: "Allow downloads" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // The (untouched) form publishes with the seeded policies — now on the PATCH.
  await page.getByLabel("Video title").fill("Seeded clip");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published!")).toBeVisible();
  expect(patchBody).toMatchObject({
    title: "Seeded clip",
    privacy: "unlisted",
    license: "7",
    comments_policy: "disabled",
    download_enabled: false,
  });
});

// Publish-timing (publish_after_transcode): the details-step toggle. Flipping it
// with a live draft syncs an immediate single-field PATCH (the server's hold
// decision happens at upload completion, so the flag must land before the bytes
// finish); the sticky value then rides the auto-create body of the next upload.
test("the publish-timing toggle PATCHes immediately and rides the next auto-create body", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  const draftBodies: Array<Record<string, unknown>> = [];
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      draftBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  // The session opens; the chunk is held so the upload stays in flight while
  // the toggle is flipped and the upload cancelled.
  const FUTURE2 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await page.route(UPLOAD_SESSION, (route) =>
    route.fulfill({
      status: 201,
      json: { upload_id: "up1", chunk_size: 1_048_576, total_chunks: 1, size: 4, expires_at: FUTURE2 },
    }),
  );
  await page.route(CHUNK, async (route) => {
    await new Promise((r) => setTimeout(r, 5_000));
    await route
      .fulfill({
        status: 200,
        json: {
          upload_id: "up1",
          video_id: "v1",
          state: "active",
          size: 4,
          chunk_size: 1_048_576,
          total_chunks: 1,
          received_chunks: [0],
          bytes_received: 4,
          expires_at: FUTURE2,
        },
      })
      .catch(() => {});
  });
  await page.route(SESSION, (route) =>
    route.request().method() === "DELETE" ? route.fulfill({ status: 204, body: "" }) : route.continue(),
  );
  let timingPatch: Record<string, unknown> | undefined;
  await page.route(VIDEO, (route) => {
    if (route.request().method() === "PATCH") {
      timingPatch = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204, body: "" });
    return route.continue();
  });
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  await openUpload(page);
  await pickFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });
  // First auto-create: default off — no publish_after_transcode key at all.
  await expect.poll(() => draftBodies.length).toBe(1);
  expect(draftBodies[0]).toEqual({ title: "clip", privacy: "private" });

  // Flip the toggle → an immediate single-field PATCH onto the draft.
  const patched = page.waitForRequest((r) => VIDEO.test(r.url()) && r.method() === "PATCH");
  await page.getByRole("switch", { name: "Publish after transcoding" }).click();
  await patched;
  expect(timingPatch).toEqual({ publish_after_transcode: true });

  // Cancel back to the pick step, re-pick: the sticky opt-in rides the create.
  await page.getByRole("button", { name: "Cancel upload" }).click();
  await expect(page.getByLabel("Video file")).toBeVisible();
  await pickFile(page, { name: "clip2.mp4", mimeType: "video/mp4", buffer: Buffer.from("test") });
  await expect.poll(() => draftBodies.length).toBe(2);
  expect(draftBodies[1]).toMatchObject({ privacy: "private", publish_after_transcode: true });
});

// The held (publish-after-transcode) state is owner/moderator-visible only —
// the studio content list badges it like scheduled/quarantined.
test("a held video shows the Transcoding badge in the studio content list", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({ json: { channels: [channel("ada_makes", "Ada Makes")] } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ title: "Held clip", state: "transcoding" })] } }),
  );
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig() }));

  await gotoStudioTab(page, "Content");
  const row = page.getByRole("listitem").filter({ hasText: "Held clip" });
  await expect(row).toBeVisible();
  await expect(row.getByText("transcoding", { exact: true })).toBeVisible();
});
