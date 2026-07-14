import { expect, test, type Page } from "@playwright/test";

// Mocked admin instance-blocklist coverage: role gating, listing, the
// block-domain form (+optional reason), and unblock. All mutations are mocked
// here; block/unblock persistence needs remote content to prove its hiding
// effect and is tracked with the fake-remote-harness follow-up in fix_plan.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const REPORTS = /\/api\/v1\/admin\/reports(\?|$)/;
const BLOCKED = /\/api\/v1\/admin\/instances\/blocked(\?|$)/;
const BLOCKED_ONE = /\/api\/v1\/admin\/instances\/blocked\/[^/]+$/;

type Role = "user" | "moderator" | "admin";

function session(role: Role) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "mod",
      email: "mod@example.test",
      role,
      email_verified: true,
      display_name: "",
      bio: "",
      created_at: new Date().toISOString(),
    },
  };
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(REPORTS, (route) =>
    route.fulfill({ json: { reports: [], limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("mod@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// Moderation → Instances tab (client-side nav keeps the in-memory session).
async function openInstancesTab(page: Page) {
  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Instances" }).click();
}

test("anonymous viewers are gated and nothing fetches", async ({ page }) => {
  let fetched = false;
  await page.route(BLOCKED, (route) => {
    fetched = true;
    return route.fulfill({ json: { instances: [], limit: 100, offset: 0 } });
  });
  await page.goto("/moderation/instances");
  await expect(page.getByText("Moderators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a moderator blocks an instance with a reason and unblocks it", async ({ page }) => {
  await signIn(page, "moderator");

  let blockBody: unknown = null;
  await page.route(BLOCKED, (route) => {
    if (route.request().method() === "POST") {
      blockBody = route.request().postDataJSON();
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ json: { instances: [], limit: 100, offset: 0 } });
  });
  await page.route(BLOCKED_ONE, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 204, body: "" })
      : route.continue(),
  );

  await openInstancesTab(page);
  await expect(page.getByText("No blocked instances")).toBeVisible();

  await page.getByLabel("Instance domain to block").fill("Spam.Example");
  await page.getByLabel("Reason for blocking (optional)").fill("spam waves");
  const blocked = page.waitForResponse(
    (r) => BLOCKED.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await blocked;

  // The domain is normalised to lowercase; the reason rides along.
  expect(blockBody).toEqual({ domain: "spam.example", reason: "spam waves" });
  await expect(page.getByText("spam.example")).toBeVisible();
  await expect(page.getByText("spam waves")).toBeVisible();

  const unblocked = page.waitForResponse(
    (r) => BLOCKED_ONE.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unblock spam.example" }).click();
  await unblocked;
  await expect(page.getByText("spam.example")).toHaveCount(0);
  await expect(page.getByText("No blocked instances")).toBeVisible();
});

test("an admin sees the existing blocklist and a 422 surfaces inline", async ({ page }) => {
  await signIn(page, "admin");

  await page.route(BLOCKED, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 422,
        json: { error: { code: "validation_failed", message: "invalid domain" } },
      });
    }
    return route.fulfill({
      json: {
        instances: [
          {
            domain: "old.example",
            reason: "long gone",
            blocked_at: new Date().toISOString(),
          },
        ],
        limit: 100,
        offset: 0,
      },
    });
  });

  await openInstancesTab(page);
  await expect(page.getByText("old.example")).toBeVisible();
  await expect(page.getByText("long gone")).toBeVisible();

  await page.getByLabel("Instance domain to block").fill("not a domain");
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(
    page.getByText("Enter a valid instance domain (a bare hostname, optionally host:port)."),
  ).toBeVisible();
});
