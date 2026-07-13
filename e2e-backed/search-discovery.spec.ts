import { expect, test, type Page } from "@playwright/test";

import { API_URL, registerUser, seedPublishedChannel } from "./fixtures";

// Search & discovery against a REAL vidra-core + search service (search-service
// W4). GATED: the endpoints ship on vidra-core's feat/search-service branch, so
// until that merges to main (and the backed stack is wired to a running
// vidra-search) these are skipped. Enable with E2E_SEARCH_SERVICE=true on a
// search-wired stack. WRITE-ONLY in this loop (npm run e2e:backed), never part
// of the mocked `npm run ci` gate.
const SEARCH_ENABLED = process.env.E2E_SEARCH_SERVICE === "true";

test.beforeEach(() => {
  test.skip(
    !SEARCH_ENABLED,
    "set E2E_SEARCH_SERVICE=true on a search-service-wired backed stack (pending vidra-core search endpoints merging to main)",
  );
});

async function loginUI(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("the header autocomplete suggests an indexed public video title", async ({ page, request }) => {
  const seeded = await seedPublishedChannel(request);

  // The search index is fed asynchronously (core outbox → search upsert), so
  // poll the public suggestions endpoint until the freshly published title is
  // indexed before driving the UI.
  const prefix = seeded.videoTitle.slice(0, 8);
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${API_URL}/api/v1/search/suggestions?q=${encodeURIComponent(prefix)}`,
        );
        const body = (await res.json()) as { suggestions: Array<{ text: string }> };
        return body.suggestions.some((s) => s.text.includes(seeded.videoTitle));
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await page.goto("/");
  const box = page.getByLabel("Search videos");
  await box.fill(prefix);
  const listbox = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option").filter({ hasText: seeded.videoTitle })).toBeVisible();
});

test("a signed-in user can delete a search-history entry", async ({ page, request }) => {
  const user = await registerUser(request, "searcher");
  await loginUI(page, user.email, "supersecret-e2e");

  // Run a search so the query is recorded to the user's history.
  const query = `history-${Date.now()}`;
  await page.getByLabel("Search videos").fill(query);
  await page.getByLabel("Search videos").press("Enter");
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${query}`));

  // The history write is async; poll the settings page until it appears.
  await page.getByRole("link", { name: user.username }).click();
  await page.getByRole("link", { name: "Manage search and recommendations" }).click();
  await expect(page.getByRole("heading", { name: "Search & recommendations" })).toBeVisible();

  const entry = page.getByText(query, { exact: true });
  await expect(entry).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: new RegExp(`Remove .*${query}.* from your search history`) }).click();
  await expect(entry).toBeHidden();
});
