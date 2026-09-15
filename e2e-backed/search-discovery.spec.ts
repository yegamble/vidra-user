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
  // The account-menu dropdown trigger is the signed-in signal in the redesigned header.
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
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

  // The history write is async; open the account menu → Settings → the search row.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Manage search and recommendations" }).click();
  await expect(page.getByRole("heading", { name: "Search & recommendations" })).toBeVisible();

  const entry = page.getByText(query, { exact: true });
  await expect(entry).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: new RegExp(`Remove .*${query}.* from your search history`) }).click();
  await expect(entry).toBeHidden();
});

// The refresh race (Wave A): a search rides a batched behavioural event that the
// browser flushes ~5s after the search, and core ingests it asynchronously after
// that. The history surface used to read once on mount and never again, so a
// search made JUST before landing here stayed invisible until a manual reload.
// This proves the search now appears on its own — and that the fix does not
// hammer the API to get there.
test("a just-made search appears in history without a manual reload", async ({ page, request }) => {
  const user = await registerUser(request, "searcher");
  await loginUI(page, user.email, "supersecret-e2e");

  const query = `noreload-${Date.now()}`;
  await page.getByLabel("Search videos").fill(query);
  await page.getByLabel("Search videos").press("Enter");
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${query}`));

  // Count reads of the history endpoint from here on — through the flush window
  // and the bounded post-flush refreshes. A regression to tight polling would
  // blow past the cap below within the ~20s we wait for the row.
  let historyReads = 0;
  page.on("request", (req) => {
    if (req.method() === "GET" && /\/me\/search-history(\?|$)/.test(req.url())) historyReads += 1;
  });

  // Reach the history surface by CLIENT-SIDE navigation — no page reload, so the
  // pending behavioural batch and its flush timer survive.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Manage search and recommendations" }).click();
  await expect(page.getByRole("heading", { name: "Search & recommendations" })).toBeVisible();

  // The just-made search shows up on its own — no reload, no extra interaction.
  await expect(page.getByText(query, { exact: true })).toBeVisible({ timeout: 20_000 });

  // Bounded: the mount read plus a handful of reconcile reads. Far below what a
  // per-second poll over the same window would produce.
  expect(historyReads).toBeLessThanOrEqual(6);
});
