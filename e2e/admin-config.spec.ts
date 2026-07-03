import { expect, test, type Page } from "@playwright/test";

// Mocked admin instance-configuration coverage (a real backend is not running in
// `npm run ci`; PATCH persistence against the real stack is proven in
// e2e-backed/instance-settings.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const SETTINGS = /\/api\/v1\/admin\/instance-settings$/;

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

const settings = {
  settings: [
    { key: "instance_name", type: "string", value: "Vidra", default: "Vidra", overridden: false },
    { key: "instance_description", type: "string", value: "", default: "", overridden: false },
    { key: "terms_url", type: "string", value: "https://terms.example", default: "", overridden: true },
    { key: "privacy_url", type: "string", value: "", default: "", overridden: false },
    { key: "contact_email", type: "string", value: "", default: "", overridden: false },
    { key: "registration_enabled", type: "bool", value: true, default: true, overridden: false },
    { key: "registration_require_approval", type: "bool", value: false, default: false, overridden: false },
    { key: "uploads_enabled", type: "bool", value: true, default: true, overridden: false },
    { key: "imports_enabled", type: "bool", value: true, default: true, overridden: false },
    { key: "live_enabled", type: "bool", value: false, default: false, overridden: false },
    { key: "comments_enabled", type: "bool", value: true, default: true, overridden: false },
    { key: "quarantine_new_uploads", type: "bool", value: false, default: false, overridden: false },
  ],
};

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

// Sign in as admin, then client-side navigate to the config page (keeps the
// in-memory session, unlike a hard goto).
async function openConfig(page: Page) {
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Config" }).click();
}

test("anonymous viewers are gated out of instance configuration", async ({ page }) => {
  let fetched = false;
  await page.route(SETTINGS, (route) => {
    fetched = true;
    return route.fulfill({ json: settings });
  });
  await page.goto("/admin/config");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular user gets no admin entry and is gated from config", async ({ page }) => {
  await signIn(page, "user");
  // No Admin entry point in the header for a non-admin.
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(SETTINGS, (route) => {
    fetched = true;
    return route.fulfill({ json: settings });
  });
  await page.goto("/admin/config");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin edits settings and saves a partial patch", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  // Grouped controls render with effective values.
  await expect(page.getByRole("heading", { name: "Instance identity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();
  await expect(page.getByLabel("Instance name")).toHaveValue("Vidra");
  const uploads = page.getByRole("switch", { name: "Video uploads" });
  await expect(uploads).toHaveAttribute("aria-checked", "true");
  // The DB-overridden terms URL shows an Overridden badge + a reset affordance.
  await expect(page.getByText("Overridden").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset to default" }).first()).toBeVisible();

  // Save is disabled until something changes.
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  // Edit two keys: rename the instance and turn uploads off.
  await page.getByLabel("Instance name").fill("My Vidra");
  await uploads.click();
  await expect(uploads).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("2 unsaved changes")).toBeVisible();

  // The PATCH carries only the changed keys; the response is the new effective doc.
  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) => {
        if (s.key === "instance_name") return { ...s, value: "My Vidra", overridden: true };
        if (s.key === "uploads_enabled") return { ...s, value: false, overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });

  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({ instance_name: "My Vidra", uploads_enabled: false });

  // The saved values are reflected back (no longer dirty).
  await expect(save).toBeDisabled();
  await expect(uploads).toHaveAttribute("aria-checked", "false");
});
