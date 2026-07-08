import { expect, test, type Page } from "@playwright/test";

// Mocked admin media-GC coverage (a real backend is not running in `npm run ci`;
// the sweep against real storage is exercised by the backend's own tests).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const GC = /\/api\/v1\/admin\/media\/gc$/;

type Role = "user" | "moderator" | "admin";

function session(role: Role) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "boss",
      email: "boss@example.test",
      role,
      email_verified: true,
      display_name: "Boss",
      bio: "",
      created_at: new Date().toISOString(),
    },
  };
}

const ORPHANS = ["originals/abc123.mp4", "thumbnails/def456.jpg"];

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function openMedia(page: Page) {
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  // The desktop console (DR12) labels this destination "Media storage".
  await page.getByRole("link", { name: "Media storage" }).click();
}

test("anonymous viewers are gated out of media GC", async ({ page }) => {
  let called = false;
  await page.route(GC, (route) => {
    called = true;
    return route.fulfill({ json: { dry_run: true, scanned: 0, orphans: [], deleted: 0 } });
  });
  await page.goto("/admin/media");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(called).toBe(false);
});

test("a regular user gets no admin entry and is gated from media GC", async ({ page }) => {
  await signIn(page, "user");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let called = false;
  await page.route(GC, (route) => {
    called = true;
    return route.fulfill({ json: { dry_run: true, scanned: 0, orphans: [], deleted: 0 } });
  });
  await page.goto("/admin/media");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(called).toBe(false);
});

test("an admin dry-runs, then double-confirms a purge", async ({ page }) => {
  await signIn(page, "admin");
  const bodies: Array<{ dry_run: boolean }> = [];
  await page.route(GC, (route) => {
    const body = route.request().postDataJSON() as { dry_run: boolean };
    bodies.push(body);
    if (body.dry_run) {
      return route.fulfill({
        json: { dry_run: true, scanned: 120, orphans: ORPHANS, deleted: 0 },
      });
    }
    return route.fulfill({
      json: { dry_run: false, scanned: 120, orphans: ORPHANS, deleted: 2 },
    });
  });
  await openMedia(page);

  // Nothing runs until the admin asks for it.
  expect(bodies).toHaveLength(0);

  // Dry run lists the would-delete orphans.
  await page.getByRole("button", { name: "Run dry run" }).click();
  await expect(page.getByText("2 orphans to delete")).toBeVisible();
  await expect(page.getByText("originals/abc123.mp4")).toBeVisible();
  await expect(page.getByText("thumbnails/def456.jpg")).toBeVisible();

  // Arm the purge, then it stays disabled until the confirm word is typed.
  await page.getByRole("button", { name: /Purge 2 orphans/ }).click();
  const confirm = page.getByRole("button", { name: "Confirm permanent purge" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type PURGE to confirm").fill("nope");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type PURGE to confirm").fill("PURGE");
  await expect(confirm).toBeEnabled();

  await confirm.click();
  await expect(page.getByText("Purge complete")).toBeVisible();
  await expect(page.getByText("Deleted 2 objects")).toBeVisible();

  // One dry run (true) then one real purge (false).
  expect(bodies.map((b) => b.dry_run)).toEqual([true, false]);
});
