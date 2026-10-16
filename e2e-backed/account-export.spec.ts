import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";

import { expect, test } from "@playwright/test";

import { API_URL, registerUser, uniqueId } from "./fixtures";

// A real single-entry ZIP using Node's CRC implementation; no archive dependency.
function peerTubeChannelArchive(handle: string) {
  const name = Buffer.from("peertube/channels.json");
  const data = Buffer.from(JSON.stringify({ channels: [{ name: handle, displayName: handle }] }));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Request the export from the settings "Your data" section.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await page.getByRole("button", { name: "Request export" }).click();

  // The card polls the job status; the download appears once the background
  // worker finishes assembling the archive.
  const downloadButton = page.getByRole("button", { name: "Download archive" });
  await expect(downloadButton).toBeVisible({ timeout: 60_000 });

  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  // Either spelling is correct here. The filename is white-labelled by the
  // instance-wide branding_hide_software_name flag, and white-label.spec.ts holds
  // that flag ON for minutes while this suite runs fullyParallel — so pinning one
  // spelling would make this spec fail for a reason that has nothing to do with
  // account export. white-label.spec.ts asserts the hidden spelling exactly, and
  // the AccountDataSection unit tests pin both, so neither branch is unproven.
  expect(download.suggestedFilename()).toMatch(/^(vidra-)?account-export\.json$/);

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

test("a PeerTube zip imports a channel through settings and persists it", async ({ page, request }) => {
  const user = await registerUser(request, "ptarchive");
  const handle = `pt${uniqueId()}`.slice(0, 30);
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("PeerTube export (.zip)").setInputFiles({
    name: "peertube-export.zip", mimeType: "application/zip", buffer: peerTubeChannelArchive(handle),
  });
  await page.getByRole("button", { name: "Import PeerTube archive" }).click();
  await expect(page.getByText("PeerTube archive imported")).toBeVisible();
  await expect(page.getByText("Channels: 1 created, 0 already present, 0 skipped.")).toBeVisible();
  const response = await request.get(`${API_URL}/api/v1/channels/${handle}`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ handle });
});
