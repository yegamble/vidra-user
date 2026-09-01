import { expect, test, type Page } from "@playwright/test";

import {
  flagVideoSensitive,
  registerUser,
  searchVideoTitles,
  seedPublishedChannel,
  setSensitivePolicy,
  waitForPublished,
} from "./fixtures";

// Sensitive-content policy against a REAL vidra-core + PostgreSQL.
//
// WHY BACKED (e2e/sensitive-content.spec.ts already covers the presentation):
// the effective policy is computed PER VIEWER inside core, from a column on the
// caller's own row — a mocked spec fulfils the feed/search response itself, so
// it can only ever prove that the frontend renders the fixture it was handed.
// It structurally cannot prove that core applies the viewer's stored policy,
// which is the whole of the "hide" behaviour:
//
//   - "hide" is SERVER-enforced: vidra-core drops flagged videos from that
//     viewer's browse/search results (httpapi.effectiveHideSensitive). The
//     video never reaches the browser, so no client assertion in the mocked
//     suite is even capable of failing when core stops filtering.
//   - warn/blur/display are presentation, but they are presentation applied to
//     a REAL is_sensitive/sensitive_reason that round-tripped through the
//     database — which the mock hard-codes.
//
// The surface is SEARCH, deliberately, not the home feed: the home feed's first
// page is fetched by a server component with no viewer token, so what it shows
// is the INSTANCE policy. The search results component always fetches
// client-side with the signed-in viewer's bearer token, so it is the surface
// where the per-viewer answer is actually visible.
//
// NOTE the instance default sensitive_content_policy is "hide"
// (instancesettings.DefaultSensitiveContentPolicy), so on a fresh backed stack
// a flagged video is invisible until a viewer overrides the policy for
// themselves. That makes "display" the interesting positive case, not a no-op.

async function loginUI(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The account-menu dropdown trigger is the signed-in signal in the redesigned header.
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// Search from the app header (a client-side router push), which keeps the
// in-memory access token — a hard page load would have to wait on the refresh
// cookie restoring the session, and an anonymous search is exactly the wrong
// answer for a per-viewer assertion.
async function searchUI(page: Page, query: string) {
  const box = page.getByLabel("Search videos");
  await box.fill(query);
  await box.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${query}`));
}

/**
 * Seeds a published, owner-flagged sensitive video and returns the token that
 * identifies it uniquely in search (the generated title is `Video <id>`, and
 * core's search is a title substring match, so the id alone is a precise query).
 */
async function seedSensitiveVideo(request: Parameters<typeof seedPublishedChannel>[0]) {
  const seeded = await seedPublishedChannel(request);
  const reason = "Graphic surgery footage";
  expect(await flagVideoSensitive(request, seeded.token, seeded.videoId, reason)).toBe(200);
  // Search only returns state="published"; the upload above returns before the
  // pipeline has taken the video there.
  await waitForPublished(request, seeded.videoId);
  return { ...seeded, reason, query: seeded.videoTitle.replace(/^Video /, "") };
}

test("a hide viewer never receives the flagged video that a display viewer sees", async ({
  page,
  request,
}) => {
  const seeded = await seedSensitiveVideo(request);

  // A viewer who has opted INTO seeing flagged content.
  const viewer = await registerUser(request, "sensdisp");
  expect(await setSensitivePolicy(request, viewer.token, "display")).toBe(200);

  await loginUI(page, viewer.email, "supersecret-e2e");
  await searchUI(page, seeded.query);

  // Core served it because THIS viewer's stored policy says display, and the
  // card carries no sensitive treatment.
  const row = page.getByTestId("search-result-row").filter({ hasText: seeded.videoTitle });
  await expect(row).toBeVisible();
  await expect(row.getByText("Sensitive", { exact: true })).toHaveCount(0);

  // Now the same viewer switches to "hide" through the settings UI — the page
  // that owns the PATCH /auth/me write.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Manage sensitive-content settings" }).click();
  // The select, not the "Sensitive content" heading: the page title and the
  // section title are both that phrase, so a heading locator is ambiguous.
  const policySelect = page.getByLabel("Show sensitive videos");
  await expect(policySelect).toBeVisible();
  await policySelect.selectOption("hide");
  await expect(page.getByText("Saved.")).toBeVisible();

  // The identical search now comes back empty: core dropped the row before it
  // ever reached the browser. This is the assertion a mocked spec cannot make —
  // there, the video is absent only because the test chose not to send it.
  await searchUI(page, seeded.query);
  await expect(page.getByText("No results")).toBeVisible();
  await expect(page.getByTestId("search-result-row").filter({ hasText: seeded.videoTitle })).toHaveCount(0);

  // Database-side evidence of the same split, straight from the API: one query,
  // two callers, two different answers.
  expect(await searchVideoTitles(request, seeded.query, viewer.token)).not.toContain(
    seeded.videoTitle,
  );
  const seer = await registerUser(request, "senssee");
  expect(await setSensitivePolicy(request, seer.token, "display")).toBe(200);
  expect(await searchVideoTitles(request, seeded.query, seer.token)).toContain(seeded.videoTitle);
});

test("a blur viewer gets the real flag blurred, badged and captioned", async ({
  page,
  request,
}) => {
  const seeded = await seedSensitiveVideo(request);

  const viewer = await registerUser(request, "sensblur");
  expect(await setSensitivePolicy(request, viewer.token, "blur")).toBe(200);

  await loginUI(page, viewer.email, "supersecret-e2e");
  await searchUI(page, seeded.query);

  // Blur is presentation, not withholding: core still serves the video.
  const row = page.getByTestId("search-result-row").filter({ hasText: seeded.videoTitle });
  await expect(row).toBeVisible();

  // The poster is blurred. seedPublishedChannel's upload leaves has_thumbnail
  // true, so there is a real <img> to carry the treatment (with no poster the
  // card renders its fallback and this would silently assert nothing).
  await expect(row.locator("img")).toHaveClass(/blur-2xl/);

  // Badged — and the badge's tooltip is the creator's own warning text, which
  // travelled owner -> PATCH /videos/{id} -> Postgres -> search response -> DOM.
  const badge = row.getByText("Sensitive", { exact: true });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("title", seeded.reason);
});
