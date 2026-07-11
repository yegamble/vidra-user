import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  adminToken,
  instanceAbout,
  instanceSettings,
  uniqueId,
} from "./fixtures";

// Proves the admin instance-configuration page against a real vidra-core +
// PostgreSQL (the compose stack): the deterministic admin edits settings through
// the UI, and the change is proven to have reached the DB-backed overlay — both
// via the public GET /instance surface (for the instance name) and via the
// GET /admin/instance-settings effective read (for a feature toggle round trip).
//
// WRITE-ONLY in this loop: authored to run under the `backend-backed` project
// (npm run e2e:backed), not part of the mocked `npm run ci` gate.

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // Client-side nav keeps the in-memory session. The DR12 admin-console redesign
  // replaced the horizontal AdminTabs (desktop-hidden, `lg:hidden`) with the
  // desktop AdminConsole rail (`lg:flex`), which labels the instance-config
  // destination "Instance" (→ /admin/config) — the old "Config" tab is only in
  // the hidden AdminTabs at this viewport, so click the rail's "Instance" link.
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Instance", exact: true }).click();
  // /admin/config is a layout route (config-parity W2 IA) — the index
  // redirects to its first page, General, whose identity section is titled
  // "Platform".
  await expect(page).toHaveURL(/\/admin\/config\/general$/);
  await expect(page.getByRole("heading", { name: "Platform", exact: true })).toBeVisible();
}

// Navigate the persistent config rail to one of the IA's pages.
async function openConfigPage(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Configuration pages" })
    .getByRole("link", { name: label })
    .click();
}

test("editing the instance name persists to the DB and shows on the public instance endpoint", async ({
  page,
  request,
}) => {
  const name = `Vidra ${uniqueId()}`;
  await loginAsAdmin(page);

  const nameInput = page.getByLabel("Name", { exact: true });
  await nameInput.fill(name);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // The public instance about endpoint reflects the new name after a fresh read.
  await expect
    .poll(async () => (await instanceAbout(request)).name)
    .toBe(name);

  // And the effective admin overlay marks the key as DB-overridden.
  const token = await adminToken(request);
  const settings = await instanceSettings(request, token);
  expect(settings.instance_name.value).toBe(name);
  expect(settings.instance_name.overridden).toBe(true);

  // The change is visible in the UI after a fresh load/refetch (not just optimistic).
  // A hard reload restores the admin session from its httpOnly cookie, so the
  // config form reloads its persisted value straight from the DB. We deliberately
  // do NOT re-run loginAsAdmin here: signing in again while already session-restored
  // fires a deferred post-login router.push("/") that races these assertions and can
  // navigate away from the config page before the field is read.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Platform", exact: true })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
});

test("toggling a feature off then on round-trips through the DB overlay", async ({ page, request }) => {
  await loginAsAdmin(page);
  // The uploads toggle re-homed to the VOD page in the W2 IA.
  await openConfigPage(page, "VOD");

  const uploads = page.getByRole("switch", { name: "Video uploads" });
  const save = page.getByRole("button", { name: "Save changes" });

  // Turn uploads off and save.
  if ((await uploads.getAttribute("aria-checked")) === "true") {
    await uploads.click();
  }
  await expect(uploads).toHaveAttribute("aria-checked", "false");
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // The DB overlay now overrides uploads_enabled to false.
  let token = await adminToken(request);
  let settings = await instanceSettings(request, token);
  expect(settings.uploads_enabled.value).toBe(false);
  expect(settings.uploads_enabled.overridden).toBe(true);

  // Turn it back on and save — the overlay reflects the round trip.
  await uploads.click();
  await expect(uploads).toHaveAttribute("aria-checked", "true");
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  token = await adminToken(request);
  settings = await instanceSettings(request, token);
  expect(settings.uploads_enabled.value).toBe(true);
});
