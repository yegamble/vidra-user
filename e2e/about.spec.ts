import { expect, test } from "@playwright/test";

const INSTANCE = /\/api\/v1\/instance$/;
const INSTANCE_ABOUT = /\/api\/v1\/instance\/about$/;
const INSTANCE_CONTACT = /\/api\/v1\/instance\/contact$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;

function instanceJson(federationEnabled: boolean, overrides: Record<string, unknown> = {}) {
  return {
    name: "Vidra Test",
    description: "A test instance.",
    short_description: "A community video home.",
    default_language: "en",
    categories: ["7"],
    moderator_languages: ["en"],
    server_country: "Canada",
    is_sensitive: true,
    sensitive_content_policy: "warn",
    contact_form_enabled: true,
    social_links: {
      website: "https://vidra.example.test",
      mastodon: "https://social.example.test/@vidra",
      x: "",
      bluesky: "https://bsky.app/profile/vidra.example.test",
    },
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: false,
    oauth_providers: [],
    federation_enabled: federationEnabled,
    terms_url: "https://example.test/terms",
    privacy_url: "",
    contact_email: "admin@example.test",
    features: { uploads: true, imports: true, live: false, comments: true },
    ...overrides,
  };
}

const aboutJson = {
  description: "## Built for makers\n\nA place for **careful** publishing.",
  terms: "Be kind.\n\n- Credit creators",
  code_of_conduct: "No harassment.",
  moderation_info: "Reports are reviewed by humans.",
  administrator_info: "The Vidra maintainers.",
  creation_reason: "We wanted a calmer video space.",
  maintenance_lifetime: "As long as the community needs it.",
  business_model: "Member support and grants.",
  hardware_info: "Two small servers.",
  support_text: "Support the instance through **community donations**.",
};

const emptyAbout = {
  description: "",
  terms: "",
  code_of_conduct: "",
  moderation_info: "",
  administrator_info: "",
  creation_reason: "",
  maintenance_lifetime: "",
  business_model: "",
  hardware_info: "",
  support_text: "",
};

const videoConfig = {
  categories: [{ id: "7", label: "Comedy" }],
  languages: [{ id: "en", label: "English" }],
  licenses: [],
};

async function routeAbout(
  page: import("@playwright/test").Page,
  instance = instanceJson(true),
  about = aboutJson,
) {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instance }));
  await page.route(INSTANCE_ABOUT, (route) => route.fulfill({ json: about }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig }));
}

test("the PeerTube-style about page renders platform information and markdown sections", async ({
  page,
}) => {
  await routeAbout(page);
  await page.goto("/about");

  await expect(page.getByRole("heading", { name: "Vidra Test", exact: true })).toBeVisible();
  await expect(page.getByText("A community video home.")).toBeVisible();
  await expect(page.getByText("ActivityPub", { exact: true })).toBeVisible();
  await expect(page.getByText("Comedy")).toBeVisible();
  await expect(page.getByText("English")).toBeVisible();
  await expect(page.getByText("Vidra Test is dedicated to sensitive content.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Built for makers" })).toBeVisible();
  await expect(page.getByText("careful")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Terms" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms of service" })).toBeVisible();
  await expect(page.getByText("Server country: Canada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute(
    "href",
    "https://vidra.example.test",
  );
  await expect(page.getByRole("link", { name: "Bluesky" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(page.getByText("The Vidra maintainers.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Moderation and code of conduct" })).toBeVisible();
  await expect(page.getByText("Reports are reviewed by humans.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Technical information" })).toBeVisible();
  await expect(page.getByText("vidra v0.1.0")).toBeVisible();
  await expect(page.getByText("Video uploads")).toBeVisible();

  await page.getByRole("button", { name: "Support" }).click();
  const support = page.getByRole("dialog", { name: "Support Vidra Test" });
  await expect(support.getByText("community donations")).toBeVisible();
  await support.getByRole("button", { name: "Close" }).click();
});

test("the contact modal posts visitor messages and shows success", async ({ page }) => {
  await routeAbout(page);
  let body: unknown = null;
  await page.route(INSTANCE_CONTACT, (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 202, body: "" });
  });
  await page.goto("/about");

  await page.getByRole("button", { name: "Contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Contact Vidra Test" });
  await dialog.getByLabel("Your name").fill("Ada");
  await dialog.getByLabel("Your email").fill("ada@example.test");
  await dialog.getByLabel("Subject").fill("Hello");
  await dialog.getByLabel("Message").fill("This is a thoughtful message.");
  await dialog.getByRole("button", { name: "Send message" }).click();

  expect(body).toEqual({
    from_name: "Ada",
    from_email: "ada@example.test",
    subject: "Hello",
    body: "This is a thoughtful message.",
  });
  await expect(dialog.getByRole("status")).toContainText(
    "Your message has been sent to the administrators.",
  );
});

test("the contact modal maps 422, disabled, and rate-limit errors", async ({ page }) => {
  await routeAbout(page);
  let attempt = 0;
  await page.route(INSTANCE_CONTACT, (route) => {
    attempt += 1;
    if (attempt === 1) {
      return route.fulfill({
        status: 422,
        json: {
          error: {
            code: "validation_failed",
            message: "validation failed",
            fields: [{ field: "body", message: "Body must be at least 10 characters." }],
          },
        },
      });
    }
    if (attempt === 2) {
      return route.fulfill({
        status: 409,
        json: { error: { code: "contact_form_disabled", message: "contact form disabled" } },
      });
    }
    return route.fulfill({
      status: 429,
      json: { error: { code: "rate_limited", message: "rate limit exceeded" } },
    });
  });
  await page.goto("/about");

  await page.getByRole("button", { name: "Contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Contact Vidra Test" });
  await dialog.getByLabel("Your name").fill("Ada");
  await dialog.getByLabel("Your email").fill("ada@example.test");
  await dialog.getByLabel("Subject").fill("Hello");
  await dialog.getByLabel("Message").fill("Too short");

  await dialog.getByRole("button", { name: "Send message" }).click();
  await expect(dialog.getByText("Body must be at least 10 characters.")).toBeVisible();

  await dialog.getByLabel("Message").fill("This is now long enough.");
  await dialog.getByRole("button", { name: "Send message" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "The contact form is disabled on this instance.",
  );

  await dialog.getByRole("button", { name: "Send message" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "You can only send one message per hour",
  );
});

test("a non-federating instance is labeled Local only and hides empty optional sections", async ({
  page,
}) => {
  await routeAbout(
    page,
    instanceJson(false, {
      categories: [],
      moderator_languages: [],
      is_sensitive: false,
      contact_form_enabled: false,
      social_links: { website: "", mastodon: "", x: "", bluesky: "" },
    }),
    emptyAbout,
  );
  await page.goto("/about");

  await expect(page.getByText("Local only", { exact: true })).toBeVisible();
  await expect(page.getByText(/does not federate/)).toBeVisible();
  await expect(page.getByText("ActivityPub", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Team" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Contact" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Support" })).toHaveCount(0);
});

test("the sidebar About entry reaches the page", async ({ page }) => {
  await routeAbout(page);
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "About" })
    .click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { name: "Vidra Test", exact: true })).toBeVisible();
});

test("an instance fetch failure shows the retryable error state", async ({ page }) => {
  let calls = 0;
  await page.route(INSTANCE, (route) => {
    calls++;
    if (calls === 1) {
      return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
    }
    return route.fulfill({ json: instanceJson(true) });
  });
  await page.route(INSTANCE_ABOUT, (route) => route.fulfill({ json: aboutJson }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig }));
  await page.goto("/about");

  await expect(page.getByText("Could not load this instance's details.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Vidra Test", exact: true })).toBeVisible();
});
