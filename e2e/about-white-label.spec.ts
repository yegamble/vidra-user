import { expect, test } from "@playwright/test";

// White-label (branding.hide_software_name) on the About pages.
//
// A SEPARATE FILE from about.spec.ts on purpose: that file is `mode: "serial"`
// for its redirect/metadata scenarios, which share one cold SSR instance-config
// warm-up, and a serial group SKIPS its remaining tests once one fails — which
// the mocked lane's zero-skip audit rightly treats as a failure of its own.
// These three cases share no state (each routes its own fixture and navigates
// from scratch), so they must not inherit that coupling. Playwright refuses a
// `mode: "parallel"` describe nested inside a serial one, so a nested describe
// cannot opt out either.
//
// MECHANISM. The About page's snapshot reaches the client through the page.route
// mocks below: playwright.config pins the SERVER's INTERNAL_API_BASE_URL at an
// unreachable address, so the RSC read resolves to null and InstanceAboutView
// re-reads /instance from the browser (see its bootstrap effect). That is why
// this state is drivable at all here — and why the 404 on /about/vidra, decided
// SERVER-side from the same snapshot, is NOT: that is proved in
// app/about/vidra/page.test.tsx, and end to end in e2e-backed/white-label.spec.ts.
// What this file can prove about that URL is that reaching it shows no software
// attribution.
//
// Fixtures are local, matching every other spec in e2e/ (the mocked suite has no
// shared helper module, by convention).

const INSTANCE = /\/api\/v1\/instance$/;
const INSTANCE_ABOUT = /\/api\/v1\/instance\/about$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;

// The instance name is deliberately NOT "Vidra Test" (about.spec.ts's fixture
// name) so a whole-page sweep for the software name means something, and the
// social links are cleared because their hrefs point at a vidra.example.test
// domain that is the OPERATOR's, not the software's.
function instanceJson(hideSoftwareName: boolean, name = "A17 Lab Tube") {
  return {
    name,
    description: "A test instance.",
    short_description: "A community video home.",
    default_language: "en",
    categories: [],
    moderator_languages: [],
    server_country: "",
    is_sensitive: false,
    sensitive_content_policy: "warn",
    contact_form_enabled: true,
    social_links: { website: "", mastodon: "", x: "", bluesky: "" },
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: false,
    oauth_providers: [],
    federation_enabled: true,
    terms_url: "",
    privacy_url: "",
    contact_email: "",
    features: { uploads: true, imports: true, live: false, comments: true },
    branding: {
      avatar: { url: "/api/v1/instance/avatar", is_fallback: false },
      banner: { url: "/api/v1/instance/banner", is_fallback: false },
      logos: {},
      hide_instance_name: false,
      hide_software_name: hideSoftwareName,
    },
  };
}

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

const videoConfig = { categories: [], languages: [], licenses: [] };

async function routeAbout(
  page: import("@playwright/test").Page,
  instance: ReturnType<typeof instanceJson>,
) {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instance }));
  await page.route(INSTANCE_ABOUT, (route) => route.fulfill({ json: emptyAbout }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig }));
}

test("white-label: the About pages name the instance and never the software", async ({ page }) => {
  await routeAbout(page, instanceJson(true));
  await page.goto("/about/instance/home");
  await expect(page.getByRole("heading", { name: "A17 Lab Tube", exact: true })).toBeVisible();

  // The software's own tab is gone; the other two stay.
  const nav = page.getByRole("navigation", { name: "About categories" });
  await expect(nav.getByRole("link", { name: "Vidra", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Platform", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Network", exact: true })).toBeVisible();

  // Technical: the whole Software row goes (the version identifies the product
  // as surely as the name), and the rest of the table is untouched.
  await page.getByRole("link", { name: "Technical information" }).click();
  await expect(page).toHaveURL(/\/about\/instance\/tech$/);
  await expect(page.getByRole("heading", { name: "Technical information" })).toBeVisible();
  await expect(page.getByText("vidra 0.1.0")).toHaveCount(0);
  await expect(page.getByText("Software", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Video uploads")).toBeVisible();

  // Network: neutral prose, protocol names intact — a NETWORK is not this product.
  await page.getByRole("link", { name: "Network", exact: true }).click();
  await expect(page).toHaveURL(/\/about\/network$/);
  await expect(page.getByText(/This platform speaks three open protocols/).first()).toBeVisible();
  await expect(page.getByText(/This platform federates individual channels/).first()).toBeVisible();
  await expect(page.getByText("ActivityPub", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/vidra/i);
});

test("white-label: /about/vidra renders no software attribution", async ({ page }) => {
  await routeAbout(page, instanceJson(true));
  await page.goto("/about/vidra");

  // The identity header still renders (the route exists whenever the SERVER
  // snapshot is unreadable — see the MECHANISM note at the top), but the section that
  // names the software does not.
  await expect(page.getByRole("heading", { name: "A17 Lab Tube", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /powered by/i })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/vidra/i);
});

test("the software tab and its hero stay put when the name is not hidden", async ({ page }) => {
  // The regression guard for every instance that never touches the setting: an
  // explicit false must behave exactly like today.
  await routeAbout(page, instanceJson(false));
  await page.goto("/about/vidra");
  await expect(
    page.getByRole("heading", { name: "This platform is powered by Vidra" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "About categories" }).getByRole("link", {
      name: "Vidra",
      exact: true,
    }),
  ).toBeVisible();
});
