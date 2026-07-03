import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { API_URL, registerUser, uniqueId } from "./fixtures";

// Backend-backed e2e (real vidra-core + Postgres, no mocks): proves the account
// export round trip. An account with a channel is seeded via the API, then the
// UI requests the export, honestly polls the background job to completion
// (GET /me/export), downloads the finished archive, and the file parses as the
// format-v1 JSON archive including the user's channel — which can only happen
// if the export job ran server-side and persisted a downloadable archive.
test("the account export round-trips: request → poll → download parses as JSON with the channel", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "exp");
  const handle = `expch${uniqueId()}`;
  await request.post(`${API_URL}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { handle, display_name: `Export channel ${handle}` },
  });

  // Sign in through the UI.
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Request the export from the settings "Your data" section.
  await page.getByRole("link", { name: user.username }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await page.getByRole("button", { name: "Request export" }).click();

  // The card polls the job status; the download appears once the background
  // worker finishes assembling the archive.
  const downloadButton = page.getByRole("button", { name: "Download archive" });
  await expect(downloadButton).toBeVisible({ timeout: 60_000 });

  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("vidra-account-export.json");

  // The downloaded file is the real archive: parse it and assert the format
  // marker, the profile, and the seeded channel made it in.
  const path = await download.path();
  const archive = JSON.parse(readFileSync(path, "utf8")) as {
    vidra_export: { version: number };
    profile: { username: string; email: string };
    channels?: Array<{ handle?: string }>;
  };
  expect(archive.vidra_export.version).toBe(1);
  expect(archive.profile.username).toBe(user.username);
  expect((archive.channels ?? []).map((c) => c.handle)).toContain(handle);
});
