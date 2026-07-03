import { expect, test, type Page } from "@playwright/test";

// Mocked registration-approval coverage (a real backend is not running in
// `npm run ci`; the persistence round-trip lives in
// e2e-backed/registration-approval.spec.ts, gated behind an approval-on stack).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const INSTANCE = /\/api\/v1\/instance$/;
const REGISTER = /\/api\/v1\/auth\/register$/;
const REQUESTS = /\/api\/v1\/admin\/registration-requests(\?|$)/;
const APPROVE = /\/api\/v1\/admin\/registration-requests\/[^/]+\/approve$/;
const REJECT = /\/api\/v1\/admin\/registration-requests\/[^/]+\/reject$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;

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

function pendingRequest(id: string, username: string, note?: string) {
  return {
    id,
    username,
    email: `${username}@example.test`,
    note,
    status: "pending",
    created_at: new Date().toISOString(),
  };
}

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

// Client-side navigate Admin → Registration tab (a hard goto would drop the
// in-memory session). The Users landing fetch is mocked empty along the way.
async function openQueue(page: Page) {
  await page.route(USERS, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Registration" }).click();
  await expect(page).toHaveURL(/\/admin\/registration-requests$/);
}

test("anonymous viewers are gated out of registration requests", async ({ page }) => {
  let fetched = false;
  await page.route(REQUESTS, (route) => {
    fetched = true;
    return route.fulfill({ json: { requests: [], limit: 20, offset: 0 } });
  });
  await page.goto("/admin/registration-requests");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("regular users are gated out and see no Admin nav entry", async ({ page }) => {
  await signIn(page, "user");
  let fetched = false;
  await page.route(REQUESTS, (route) => {
    fetched = true;
    return route.fulfill({ json: { requests: [], limit: 20, offset: 0 } });
  });
  // No Admin nav entry for a regular user; the direct URL (a hard load, so
  // effectively signed out) shows the permission gate and never fetches.
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await page.goto("/admin/registration-requests");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin lists the pending queue with applicant details", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REQUESTS, (route) =>
    route.fulfill({
      json: {
        requests: [
          pendingRequest("r1", "ada", "I make hardware videos"),
          pendingRequest("r2", "grace"),
        ],
        limit: 100,
        offset: 0,
      },
    }),
  );

  await openQueue(page);
  await expect(page.getByText("ada@example.test")).toBeVisible();
  await expect(page.getByText("grace@example.test")).toBeVisible();
  await expect(page.getByText("I make hardware videos")).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Approve ada" })).toBeVisible();
});

test("approving flips the row in place", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REQUESTS, (route) =>
    route.fulfill({ json: { requests: [pendingRequest("r1", "ada")], limit: 100, offset: 0 } }),
  );
  await page.route(APPROVE, (route) => route.fulfill({ status: 204, body: "" }));

  await openQueue(page);
  const approved = page.waitForResponse(
    (r) => APPROVE.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Approve ada" }).click();
  await approved;

  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await expect(page.getByText(/Approved by boss/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve ada" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject ada" })).toHaveCount(0);
});

test("rejecting with a note flips the row and records the note", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REQUESTS, (route) =>
    route.fulfill({ json: { requests: [pendingRequest("r1", "ada")], limit: 100, offset: 0 } }),
  );
  let body: unknown;
  await page.route(REJECT, async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 204, body: "" });
  });

  await openQueue(page);
  await page.getByLabel("Internal note for ada").fill("looks like a spam signup");
  const rejected = page.waitForResponse(
    (r) => REJECT.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Reject ada" }).click();
  await rejected;

  expect(body).toEqual({ note: "looks like a spam signup" });
  await expect(page.getByText("rejected", { exact: true })).toBeVisible();
  await expect(page.getByText(/Rejected by boss/)).toBeVisible();
  await expect(page.getByText("looks like a spam signup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve ada" })).toHaveCount(0);
});

test("a 409 on approve (name since taken) is surfaced inline and the row stays pending", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(REQUESTS, (route) =>
    route.fulfill({ json: { requests: [pendingRequest("r1", "ada")], limit: 100, offset: 0 } }),
  );
  await page.route(APPROVE, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "conflict", message: "username already taken" } },
    }),
  );

  await openQueue(page);
  await page.getByRole("button", { name: "Approve ada" }).click();

  await expect(page.getByText(/has since been taken/)).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();
  // Still actionable (e.g. reject it instead).
  await expect(page.getByRole("button", { name: "Reject ada" })).toBeEnabled();
});

// --- Signup pending path -----------------------------------------------------

function instanceJson(requiresApproval: boolean) {
  return {
    name: "Vidra",
    description: "",
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: requiresApproval,
    terms_url: "",
    privacy_url: "",
    contact_email: "",
  };
}

test("signup on an approval-required instance shows the copy and the pending confirmation", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(true) }));
  let body: unknown;
  await page.route(REGISTER, async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { status: "pending" } });
  });

  await page.goto("/signup");
  // The approval requirement is disclosed under the form before submitting.
  await expect(page.getByText(/require administrator approval/)).toBeVisible();

  await page.getByLabel("Username").fill("ada");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByLabel("Message to the administrators (optional)").fill("hello!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Your account is awaiting approval")).toBeVisible();
  // Nobody is signed in — no session was created.
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  expect(body).toEqual({
    username: "ada",
    email: "ada@example.test",
    password: "supersecret",
    note: "hello!",
    // The web client always opts sessions into cookie mode; on a 202 pending
    // outcome no session (or cookie) is created, but the flag is still sent.
    cookie_mode: true,
  });
});

test("signup without approval still signs straight in (no approval copy)", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(false) }));
  await page.route(REGISTER, (route) => route.fulfill({ json: session("user") }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.goto("/signup");
  await expect(page.getByText(/require administrator approval/)).toHaveCount(0);
  await expect(page.getByLabel("Message to the administrators (optional)")).toHaveCount(0);

  await page.getByLabel("Username").fill("ada");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
