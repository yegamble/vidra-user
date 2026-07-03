import { expect, test, type Page } from "@playwright/test";

// Mocked remote-channel-follow coverage (a real backend is not running in
// `npm run ci`). The full follow lifecycle (WebFinger resolve → pending row →
// remote Accept → accepted) needs a second federated instance; the backend's
// own httptest "remote instance" integration suite proves that loop — these
// tests prove the UI contract: form → POST body, list rendering with state
// badges, unfollow, and the 422/503 error surfaces.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const SUBS = /\/api\/v1\/me\/subscriptions\/videos(\?|$)/;
const REMOTE_FOLLOWS = /\/api\/v1\/me\/remote-follows(\?|$)/;
const REMOTE_FOLLOW_ONE = /\/api\/v1\/me\/remote-follows\/[^/]+$/;

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
    display_name: "",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function follow(id: string, handle: string, state: "pending" | "accepted") {
  const domain = handle.split("@")[1];
  return {
    id,
    actor_url: `https://${domain}/video-channels/${handle.split("@")[0]}`,
    handle,
    domain,
    state,
    created_at: new Date().toISOString(),
  };
}

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(SUBS, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("anonymous viewers see the sign-in prompt, not the remote-follow form", async ({ page }) => {
  await page.goto("/subscriptions");
  await expect(page.getByText("Sign in to see your subscriptions")).toBeVisible();
  await expect(page.getByLabel("Follow a remote channel")).toHaveCount(0);
});

test("following a remote channel by handle posts the target and lists it pending", async ({
  page,
}) => {
  await signIn(page);

  let followBody: unknown = null;
  await page.route(REMOTE_FOLLOWS, (route) => {
    if (route.request().method() === "POST") {
      followBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: follow("f1", "films@videos.example", "pending") });
    }
    return route.fulfill({ json: { follows: [], limit: 100, offset: 0 } });
  });

  await page.getByRole("link", { name: "Subscriptions" }).click();
  await expect(page.getByText("You don’t follow any remote channels yet.")).toBeVisible();

  await page.getByLabel("Follow a remote channel").fill("@films@videos.example");
  await page.getByRole("button", { name: "Follow", exact: true }).click();

  await expect(page.getByText("films@videos.example")).toBeVisible();
  await expect(page.getByText("Pending")).toBeVisible();
  // The leading @ is stripped locally; exactly-one-of handle is sent.
  expect(followBody).toEqual({ handle: "films@videos.example" });
});

test("a channel URL is sent as actor_url", async ({ page }) => {
  await signIn(page);

  let followBody: unknown = null;
  await page.route(REMOTE_FOLLOWS, (route) => {
    if (route.request().method() === "POST") {
      followBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: follow("f2", "films@videos.example", "pending") });
    }
    return route.fulfill({ json: { follows: [], limit: 100, offset: 0 } });
  });

  await page.getByRole("link", { name: "Subscriptions" }).click();
  await page
    .getByLabel("Follow a remote channel")
    .fill("https://videos.example/video-channels/films");
  await page.getByRole("button", { name: "Follow", exact: true }).click();

  await expect(page.getByText("films@videos.example")).toBeVisible();
  expect(followBody).toEqual({ actor_url: "https://videos.example/video-channels/films" });
});

test("the remote-follows list shows state badges and unfollows", async ({ page }) => {
  await signIn(page);

  await page.route(REMOTE_FOLLOWS, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: {
          follows: [
            follow("f1", "films@videos.example", "accepted"),
            follow("f2", "news@other.example", "pending"),
          ],
          limit: 100,
          offset: 0,
        },
      });
    }
    return route.continue();
  });
  await page.route(REMOTE_FOLLOW_ONE, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 204, body: "" })
      : route.continue(),
  );

  await page.getByRole("link", { name: "Subscriptions" }).click();
  await expect(page.getByText("films@videos.example")).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("news@other.example")).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();

  const unfollowed = page.waitForResponse(
    (r) => REMOTE_FOLLOW_ONE.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unfollow films@videos.example" }).click();
  await unfollowed;

  await expect(page.getByText("films@videos.example")).toHaveCount(0);
  await expect(page.getByText("news@other.example")).toBeVisible();
});

test("invalid input, unresolvable targets, and disabled federation surface errors", async ({
  page,
}) => {
  await signIn(page);

  let status = 422;
  await page.route(REMOTE_FOLLOWS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status,
        json: {
          error: {
            code: status === 503 ? "federation_disabled" : "validation_failed",
            message: "nope",
          },
        },
      });
    }
    return route.fulfill({ json: { follows: [], limit: 100, offset: 0 } });
  });

  await page.getByRole("link", { name: "Subscriptions" }).click();
  const input = page.getByLabel("Follow a remote channel");

  // Local parse failure — no request leaves the page.
  await input.fill("not a handle");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByText("Enter a name@domain handle or a channel URL.")).toBeVisible();

  // Backend 422 (unresolvable target).
  await input.fill("ghost@nowhere.example");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    page.getByText("That channel could not be found. Check the handle or URL and try again."),
  ).toBeVisible();

  // Backend 503 (federation disabled on this instance).
  status = 503;
  await input.fill("films@videos.example");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByText("Federation is disabled on this instance.")).toBeVisible();
});
