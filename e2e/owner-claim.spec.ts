import { expect, test, type Page } from "@playwright/test";

// The first-run owner wizard, route-mocked (a real backend is not running in
// `npm run ci`; the contract against a live vidra-core lives in
// e2e-backed/owner-claim.spec.ts).
//
// Everything here hangs off one field on GET /instance: `owner_claim_pending`.
// While it is true the server has no owner, every signup path is refused, and
// the only useful thing the app can do is route people to /setup/claim.
const INSTANCE = /\/api\/v1\/instance$/;
const CLAIM = /\/api\/v1\/setup\/claim-owner$/;
const REGISTER = /\/api\/v1\/auth\/register$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;

function instanceDoc(ownerClaimPending: boolean) {
  return {
    name: "Vidra",
    registration_enabled: true,
    registration_requires_approval: false,
    registration_requires_email_verification: false,
    registration_minimum_age: 0,
    registration_disabled_reason: "",
    owner_claim_pending: ownerClaimPending,
    oauth_providers: [],
    atproto_login: false,
  };
}

/** The session the claim's 201 hands back — the same shape a login returns. */
const claimedSession = {
  token: "acc",
  refresh_token: "",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "admin",
    email_verified: true,
    display_name: "",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

async function mockInstance(page: Page, ownerClaimPending: boolean) {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceDoc(ownerClaimPending) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
}

async function fillWizard(page: Page, token = "s3tup-token") {
  await page.getByLabel("Setup token").fill(token);
  await page.getByLabel("Username").fill("ada");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password", { exact: true }).fill("supersecret");
  await page.getByLabel("Confirm password").fill("supersecret");
}

const CARD_HEADING = "This server is waiting for its owner";

test("an unclaimed server points at the wizard from home, sign in and sign up", async ({
  page,
}) => {
  await mockInstance(page, true);

  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(path);
    const card = page.getByRole("heading", { name: CARD_HEADING });
    await expect(card).toBeVisible();
    // Dismiss-free: the card carries exactly one control, and it is the way on.
    const cta = page.getByRole("link", { name: "Finish setup" });
    await expect(cta).toHaveAttribute("href", "/setup/claim");
  }
});

test("a claimed server shows no first-run card anywhere", async ({ page }) => {
  await mockInstance(page, false);

  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: CARD_HEADING })).toHaveCount(0);
  }
});

test("the wizard creates the owner and leaves them signed in", async ({ page }) => {
  await mockInstance(page, true);
  let claimBody: Record<string, unknown> | null = null;
  await page.route(CLAIM, (route) => {
    claimBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 201, json: claimedSession });
  });

  await page.goto("/setup/claim");
  await expect(page.getByText("Finish setting up your server")).toBeVisible();
  await fillWizard(page);
  await page.getByRole("button", { name: "Create the owner account" }).click();

  await expect(page.getByRole("heading", { name: "Your server is ready" })).toBeVisible();
  await expect(page.getByText("You are signed in as ada")).toBeVisible();
  // The finished state is the hand-off, not a dead end.
  await expect(page.getByRole("link", { name: "Open your server settings" })).toHaveAttribute(
    "href",
    "/admin",
  );
  await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
    "href",
    "/",
  );
  // Cookie mode, exactly like login/register: the refresh token never touches JS.
  expect(claimBody).toMatchObject({
    token: "s3tup-token",
    username: "ada",
    email: "ada@example.test",
    cookie_mode: true,
  });
});

test("a refused setup token names both causes, with the prod command for the live one", async ({
  page,
}) => {
  await mockInstance(page, true);
  await page.route(CLAIM, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "owner_claim_invalid", message: "invalid setup token" } },
    }),
  );

  await page.goto("/setup/claim");
  await fillWizard(page, "a-token-from-an-older-boot");
  await page.getByRole("button", { name: "Create the owner account" }).click();

  // Scoped to the page's own main landmark: Next's route announcer is also a
  // role="alert" node, and it lives outside it.
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("That setup token was not accepted.");
  await expect(alert).toContainText("new setup token every time it restarts");
  // The identical 403 also means "this server already has an owner", where the
  // log command prints nothing — so the other cause and its exit are offered.
  await expect(alert).toContainText("already has an owner");
  await expect(alert.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/login");
  // The production invocation: a bare `docker compose` on a prod host loads the
  // dev override and reads the wrong containers.
  await expect(alert).toContainText(
    "docker compose -f docker-compose.yml -f docker-compose.prod.yml " +
      "--env-file env/production.env logs api | grep 'FIRST-RUN'",
  );
});

test("a claim that lost the race sends the visitor to sign in", async ({ page }) => {
  await mockInstance(page, true);
  await page.route(CLAIM, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "conflict", message: "username already taken" } },
    }),
  );

  await page.goto("/setup/claim");
  await fillWizard(page);
  await page.getByRole("button", { name: "Create the owner account" }).click();

  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("Someone finished setting up this server first.");
  await alert.getByRole("link", { name: "sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("validation problems land on their own fields", async ({ page }) => {
  await mockInstance(page, true);
  await page.route(CLAIM, (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: "validation_failed",
          message: "validation failed",
          fields: [{ field: "username", message: "must be at least 3 characters" }],
        },
      },
    }),
  );

  await page.goto("/setup/claim");
  await fillWizard(page);
  await page.getByRole("button", { name: "Create the owner account" }).click();

  await expect(page.getByText("must be at least 3 characters")).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
});

test("the wizard closes itself once the server has an owner", async ({ page }) => {
  await mockInstance(page, false);
  await page.goto("/setup/claim");
  await expect(page).toHaveURL(/\/$/);
});

test("a signup refused for want of an owner becomes a trip to the wizard", async ({ page }) => {
  // Registration is open on paper, so the form renders and lets the attempt
  // through; the refusal arrives from the register call itself — the case this
  // redirect exists for (anyone deep-linked past the card, or racing a server
  // that was claimed-then-reset).
  await mockInstance(page, true);
  await page.route(REGISTER, (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: { code: "owner_claim_required", message: "instance is awaiting its owner" },
      },
    }),
  );

  await page.goto("/signup");
  await page.getByLabel("Username").fill("ada");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/setup\/claim\?from=signup$/);
  await expect(
    page.getByText("Sign-ups are on hold until this server has an owner"),
  ).toBeVisible();
});
