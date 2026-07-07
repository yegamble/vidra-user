import { expect, test, type Page } from "@playwright/test";

// Keyboard-navigation + reduced-motion accessibility coverage (P12).
//   - the "skip to content" link is the first tab stop and jumps focus past the
//     header/navigation to the page's main content region;
//   - prefers-reduced-motion neutralizes animation/transition durations
//     app-wide (the global CSS motion utility), and does NOT when the preference
//     is absent.
// Route-mocked like the rest of the suite (no backend in `npm run ci`).
const FEED = /\/api\/v1\/videos(\?|$)/;

async function mockFeed(page: Page) {
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
}

// Read a computed animation-duration ("1s", "0.001ms", "1e-06s") as seconds.
async function spinDurationSeconds(page: Page): Promise<number> {
  const raw = await page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "animate-spin";
    document.body.appendChild(el);
    const d = getComputedStyle(el).animationDuration;
    el.remove();
    return d;
  });
  const m = /^([\d.e+-]+)(ms|s)$/.exec(raw.trim());
  if (!m) throw new Error(`unparseable animation-duration: ${raw}`);
  const value = parseFloat(m[1]);
  return m[2] === "ms" ? value / 1000 : value;
}

test("the skip link is the first tab stop and moves focus to the main content", async ({
  page,
}) => {
  await mockFeed(page);
  await page.goto("/");
  // The home h1 is sr-only (template leads with chips, not a title), so assert
  // it is in the a11y tree rather than visible.
  await expect(page.getByRole("heading", { name: "Recent videos" })).toBeAttached();

  // The skip link is the very first focusable element in the document.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();

  // Activating it moves focus to the main content region (past the header/nav).
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  const activeId = await page.evaluate(() => document.activeElement?.id);
  expect(activeId).toBe("main-content");
});

test("prefers-reduced-motion: reduce neutralizes animations app-wide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockFeed(page);
  await page.goto("/");
  // The global reduced-motion reset forces every animation to ~0 duration.
  expect(await spinDurationSeconds(page)).toBeLessThan(0.01);
});

test("without the reduced-motion preference, animations run normally", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockFeed(page);
  await page.goto("/");
  // animate-spin is a 1s animation when motion is allowed.
  expect(await spinDurationSeconds(page)).toBeGreaterThan(0.5);
});
