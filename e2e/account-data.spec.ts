import { expect, test, type Page } from "@playwright/test";

// Mocked coverage for the /settings "Your data" section (account export +
// import). The real background-job round trip is proven in
// e2e-backed/account-export.spec.ts.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const EXPORT = /\/api\/v1\/me\/export$/;
const EXPORT_DOWNLOAD = /\/api\/v1\/me\/export\/download$/;
const IMPORT = /\/api\/v1\/me\/import$/;

const user = {
  id: "u1",
  username: "ada",
  email: "ada@example.test",
  role: "user",
  email_verified: true,
  display_name: "Ada",
  bio: "",
  created_at: new Date().toISOString(),
};
const session = { token: "acc", refresh_token: "ref", token_type: "Bearer", expires_in: 900, user };

function exportStatus(state: "pending" | "running" | "done" | "failed", ready = false) {
  return {
    id: "e1",
    state,
    download_ready: ready,
    requested_at: new Date().toISOString(),
    expires_at: ready ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null,
  };
}

const archive = {
  vidra_export: { version: 1, generated_at: new Date().toISOString(), instance: "http://localhost" },
  profile: {
    username: "ada",
    email: "ada@example.test",
    display_name: "Ada",
    bio: "",
    unlisted: false,
    email_verified: true,
    created_at: new Date().toISOString(),
  },
  channels: [{ handle: "adasch", display_name: "Ada's channel" }],
};

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function openSettings(page: Page) {
  await page.getByRole("link", { name: "ada" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
}

test("requesting an export polls honestly to ready and downloads the archive", async ({ page }) => {
  await signIn(page);

  // A tiny status state machine: no export yet → POST queues it (202 pending)
  // → the first poll sees it running → the next sees it done+downloadable.
  let state: "none" | "pending" | "running" | "done" = "none";
  await page.route(EXPORT, async (route) => {
    if (route.request().method() === "POST") {
      state = "pending";
      return route.fulfill({ status: 202, json: exportStatus("pending") });
    }
    if (state === "none") {
      return route.fulfill({
        status: 404,
        json: { error: { code: "not_found", message: "no export" } },
      });
    }
    if (state === "pending") {
      state = "running";
      return route.fulfill({ json: exportStatus("pending") });
    }
    if (state === "running") {
      state = "done";
      return route.fulfill({ json: exportStatus("running") });
    }
    return route.fulfill({ json: exportStatus("done", true) });
  });
  let downloadRequested = false;
  await page.route(EXPORT_DOWNLOAD, (route) => {
    downloadRequested = true;
    return route.fulfill({ json: archive });
  });

  await openSettings(page);

  // No export yet: only the request affordance.
  const requestButton = page.getByRole("button", { name: "Request export" });
  await expect(requestButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Download archive" })).toHaveCount(0);

  // Request → honest in-progress state (no download offered while assembling).
  await requestButton.click();
  await expect(page.getByText("Preparing your export…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download archive" })).toHaveCount(0);

  // Polling lands on done + download_ready → the download appears.
  const downloadButton = page.getByRole("button", { name: "Download archive" });
  await expect(downloadButton).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your export is ready.")).toBeVisible();

  // Download: the authenticated archive fetch runs and the browser saves it.
  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("vidra-account-export.json");
  expect(downloadRequested).toBe(true);
});

test("a failed export is reported honestly with a retry", async ({ page }) => {
  await signIn(page);
  await page.route(EXPORT, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 202, json: exportStatus("pending") });
    }
    return route.fulfill({ json: exportStatus("failed") });
  });

  await openSettings(page);
  await expect(page.getByText("Your last export failed. You can request a new one.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request export" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download archive" })).toHaveCount(0);
});

test("importing an archive renders the returned per-category summary", async ({ page }) => {
  await signIn(page);
  await page.route(EXPORT, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no export" } } }),
  );
  let importBody: unknown;
  await page.route(IMPORT, (route) => {
    importBody = route.request().postDataJSON();
    return route.fulfill({
      json: {
        profile_applied: true,
        playlists_created: 2,
        playlist_items_added: 5,
        playlist_items_skipped: 1,
        follows_created: 3,
        follows_skipped: 2,
        notification_prefs_applied: 4,
        notification_prefs_skipped: 0,
        skipped_sections: { channels: 1, videos: 2, comments: 10, watch_history: 33 },
      },
    });
  });

  await openSettings(page);
  await page.getByLabel("Archive file (JSON)").setInputFiles({
    name: "vidra-account-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await page.getByRole("button", { name: "Import archive" }).click();

  await expect(page.getByText("Import finished.")).toBeVisible();
  await expect(page.getByText("Profile: display name and bio applied")).toBeVisible();
  await expect(
    page.getByText("Playlists: 2 created, 5 items added, 1 items skipped (video not on this instance)"),
  ).toBeVisible();
  await expect(
    page.getByText("Follows: 3 created, 2 skipped (channel not on this instance)"),
  ).toBeVisible();
  await expect(page.getByText("Notification preferences: 4 applied")).toBeVisible();
  await expect(
    page.getByText("Not importable from an archive: Channels (1), Videos (2), Comments (10), Watch history (33)."),
  ).toBeVisible();
  expect(importBody).toMatchObject({ vidra_export: { version: 1 } });
});

test("a non-archive file is rejected client-side without a request", async ({ page }) => {
  await signIn(page);
  await page.route(EXPORT, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no export" } } }),
  );
  let imported = false;
  await page.route(IMPORT, (route) => {
    imported = true;
    return route.fulfill({ json: {} });
  });

  await openSettings(page);
  await page.getByLabel("Archive file (JSON)").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ hello: "world" })),
  });
  await page.getByRole("button", { name: "Import archive" }).click();

  await expect(page.getByText("That file is not a vidra account archive.")).toBeVisible();
  expect(imported).toBe(false);
});
