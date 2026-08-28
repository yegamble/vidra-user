import { expect, test, type Page } from "@playwright/test";

// Mocked federation follower-approval queue coverage (config-parity W12/W15;
// a real backend is not running in `npm run ci`). The queue holds inbound
// ActivityPub channel Follows while federation_follower_approval is on.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const REQUESTS = /\/api\/v1\/admin\/federation\/follower-requests(\?|$)/;
const APPROVE = /\/api\/v1\/admin\/federation\/follower-requests\/[^/]+\/approve$/;
const REJECT = /\/api\/v1\/admin\/federation\/follower-requests\/[^/]+\/reject$/;

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

const pending = [
  {
    id: "f1",
    channel_id: "c1",
    channel_handle: "films",
    actor_url: "https://tube.example/accounts/ada",
    handle: "ada@tube.example",
    domain: "tube.example",
    created_at: new Date().toISOString(),
  },
  {
    id: "f2",
    channel_id: "c2",
    channel_handle: "music",
    actor_url: "https://peer.example/accounts/grace",
    // No cached identity: the row falls back to the actor URL.
    created_at: new Date().toISOString(),
  },
];

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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// Client-side navigate Admin → Followers tab (a hard goto would drop the
// in-memory session). The Users landing fetch is mocked empty along the way.
async function openQueue(page: Page) {
  await page.route(USERS, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Admin console" })
    .getByRole("link", { name: "Followers" })
    .click();
  await expect(page).toHaveURL(/\/admin\/federation\/follower-requests$/);
}

test("anonymous viewers are gated out of the follower queue", async ({ page }) => {
  let fetched = false;
  await page.route(REQUESTS, (route) => {
    fetched = true;
    return route.fulfill({ json: { requests: [], limit: 20, offset: 0 } });
  });
  await page.goto("/admin/federation/follower-requests");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin approves a pending follower after confirming", async ({ page }) => {
  await signIn(page, "admin");
  let approved = false;
  await page.route(REQUESTS, (route) =>
    route.fulfill({ json: { requests: pending, limit: 100, offset: 0 } }),
  );
  await page.route(APPROVE, (route) => {
    approved = true;
    return route.fulfill({ status: 204, body: "" });
  });
  await openQueue(page);

  // Both rows render: cached identity with domain, and the actor-URL fallback.
  await expect(page.getByText("ada@tube.example")).toBeVisible();
  await expect(page.getByText("from tube.example")).toBeVisible();
  await expect(page.getByText("films")).toBeVisible();
  await expect(page.getByText("https://peer.example/accounts/grace").first()).toBeVisible();

  // Approve is two-step: the first click only arms the confirmation.
  await page.getByRole("button", { name: "Approve ada@tube.example" }).click();
  expect(approved).toBe(false);
  await expect(page.getByText(/Accept ada@tube\.example as a follower\?/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm approve for ada@tube.example" }).click();

  // The resolved row leaves the pending queue.
  await expect(page.getByText("ada@tube.example")).toHaveCount(0);
  expect(approved).toBe(true);
});

test("an admin can cancel a reject, then confirm it", async ({ page }) => {
  await signIn(page, "admin");
  let rejected = false;
  await page.route(REQUESTS, (route) =>
    route.fulfill({ json: { requests: [pending[0]], limit: 100, offset: 0 } }),
  );
  await page.route(REJECT, (route) => {
    rejected = true;
    return route.fulfill({ status: 204, body: "" });
  });
  await openQueue(page);

  await page.getByRole("button", { name: "Reject ada@tube.example" }).click();
  await expect(page.getByText(/Reject ada@tube\.example\?/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(rejected).toBe(false);
  await expect(page.getByRole("button", { name: "Reject ada@tube.example" })).toBeVisible();

  await page.getByRole("button", { name: "Reject ada@tube.example" }).click();
  await page.getByRole("button", { name: "Confirm reject for ada@tube.example" }).click();
  await expect(page.getByText("No pending follower requests")).toBeVisible();
  expect(rejected).toBe(true);
});

test("an empty queue shows the empty state and a failed load can retry", async ({ page }) => {
  await signIn(page, "admin");
  let calls = 0;
  await page.route(REQUESTS, (route) => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 500, json: { error: "boom" } });
    return route.fulfill({ json: { requests: [], limit: 100, offset: 0 } });
  });
  await openQueue(page);

  await expect(page.getByText("Could not load follower requests.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No pending follower requests")).toBeVisible();
});

test("the federation config page links to the follower queue", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/admin\/instance-settings$/, (route) =>
    route.fulfill({
      json: {
        settings: [
          {
            key: "federation_follower_approval",
            type: "bool",
            value: false,
            default: false,
            overridden: false,
          },
        ],
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/config$/, (route) =>
    route.fulfill({ json: { categories: [], languages: [], licenses: [] } }),
  );
  await page.route(/\/api\/v1\/instance$/, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        federation_enabled: true,
        registration_enabled: true,
        features: { uploads: true, imports: true, live: false, comments: true },
      },
    }),
  );
  await page.route(REQUESTS, (route) =>
    route.fulfill({ json: { requests: [], limit: 100, offset: 0 } }),
  );

  // Client-side navigate Admin → Instance (config) → Federation page, keeping
  // the in-memory session.
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Admin console" })
    .getByRole("link", { name: "Instance" })
    .click();
  await expect(page).toHaveURL(/\/admin\/config\/general$/);
  await page
    .getByRole("navigation", { name: "Configuration pages" })
    .getByRole("link", { name: "Federation" })
    .click();

  const link = page.getByRole("link", { name: "Review follower requests" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/federation\/follower-requests$/);
  await expect(page.getByRole("heading", { name: "Follower requests" })).toBeVisible();
});
