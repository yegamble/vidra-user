import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, adminToken, instanceAbout } from "./fixtures";

// The white-label LEAK SWEEP: with branding_hide_software_name on, no public or
// signed-in surface may render the software's name or a "Powered by"
// attribution — in visible text, in the document title, in any <meta> content,
// or in the PWA manifest JSON.
//
// WHY THIS EXISTS AND NOT ONLY UNIT TESTS. Every consumer has a component test
// pinning both states, but those prove one component each against a stubbed
// snapshot. This is the only assertion that the SERVER's own reads agree with
// them: the root <title>, /manifest.webmanifest, the 404 title, the auth pages'
// "Powered by" line and the /about/vidra 404 are all decided server-side from
// GET /api/v1/instance, and the mocked Playwright suite cannot drive that state
// at all (playwright.config pins INTERNAL_API_BASE_URL at an unreachable
// address, and page.route intercepts browser requests only). So the surfaces
// this file sweeps are exactly the ones no other automated check can reach.
//
// Machine-readable identifiers are OUT of scope by design and are not swept:
// NodeInfo, /version, cookie and header names, localStorage keys and the
// `vidra_export` archive envelope all keep identifying the software. So is
// /admin — an operator must still be able to tell what they are running.
//
// WRITE-ONLY in this loop (npm run e2e:backed), never part of the mocked
// `npm run ci` gate.
//
// SERIAL, and hermetic in a `finally`: both tests flip one INSTANCE-WIDE setting,
// so running them concurrently would have each read the other's state. Nothing
// else in the backed suite asserts the software's name on a non-admin surface
// (peertube-import.spec asserts it on admin copy, which this feature
// deliberately leaves alone), so the ~90s window cannot cross-talk with another
// spec either.
test.describe.configure({ mode: "serial" });

/** Anything that would name the software or attribute the platform to it. */
const LEAK = /vidra|powered by/i;

/**
 * The instance's OWN name is not a leak even when it happens to contain the
 * software's name — an operator who calls their site "Vidra Test" has chosen
 * that, and hiding the software name cannot un-choose it. Masking it here keeps
 * the sweep hermetic: it does not have to rename the instance (which would race
 * instance-settings.spec.ts, running in parallel against the same stack) to stay
 * meaningful. The "powered by" half of LEAK still fires on a masked
 * "Powered by [instance]", so masking cannot hide a real attribution.
 */
function maskInstanceName(text: string, instanceName: string): string {
  const trimmed = instanceName.trim();
  if (trimmed === "") return text;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "[instance]");
}

// The public /instance snapshot every server-rendered surface reads is
// data-cached for ~60s (INSTANCE_CONFIG_REVALIDATE_SECONDS), so a settings change
// can take up to a TTL to surface. Every sweep therefore runs inside a toPass()
// poll that re-navigates, rather than reading one possibly stale render.
const CACHE_TTL_BUDGET = 90_000;

async function setHideSoftwareName(
  request: APIRequestContext,
  token: string,
  value: boolean | null,
): Promise<void> {
  const res = await request.patch(`${API_URL}/api/v1/admin/instance-settings`, {
    headers: { Authorization: `Bearer ${token}` },
    // null clears the DB overlay back to the compiled default — the only honest
    // reset, since "false" would leave the key marked overridden.
    data: { branding_hide_software_name: value },
  });
  expect(res.ok(), `PATCH instance-settings ${res.status()}`).toBeTruthy();
}

async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

/**
 * Everything a reader or a crawler can see on one page: the document title, the
 * content of every <meta>, and all visible text. Visible text specifically —
 * `innerText` skips display:none, which is what an off-screen menu or a
 * collapsed panel would otherwise contribute.
 */
async function visibleSurface(page: Page): Promise<string> {
  return page.evaluate(() => {
    const metas = Array.from(document.querySelectorAll("meta"))
      .map((m) => m.getAttribute("content") ?? "")
      .join(" \n");
    return [document.title, metas, document.body.innerText].join(" \n");
  });
}

/** The pages an anonymous visitor or a crawler can reach. */
const ANONYMOUS_PATHS = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/about",
  "/about/network",
  "/robots.txt",
  // A guessed URL: the 404 page's own title used to name the software.
  "/this-page-does-not-exist",
] as const;

/** Pages that need a session. */
const SIGNED_IN_PATHS = [
  "/settings/donations",
  "/settings/connections",
  "/settings/security",
] as const;

test("white-label: no public or signed-in surface names the software once it is hidden", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const token = await adminToken(request);
  const instanceName = (await instanceAbout(request)).name;
  const sweep = async () => maskInstanceName(await visibleSurface(page), instanceName);
  try {
    await setHideSoftwareName(request, token, true);

    // Ride out the instance-config cache ONCE on the cheapest surface, so the
    // per-path assertions below fail for their own reasons rather than for a
    // stale snapshot.
    await expect(async () => {
      await page.goto("/");
      expect(maskInstanceName(await page.title(), instanceName)).not.toMatch(LEAK);
    }).toPass({ timeout: CACHE_TTL_BUDGET });

    for (const path of ANONYMOUS_PATHS) {
      await page.goto(path);
      expect(await sweep(), `anonymous surface ${path} names the software`).not.toMatch(LEAK);
    }

    // /about/vidra is the software's own page: the URL itself is the leak, so it
    // must 404 rather than merely render empty.
    const aboutSoftware = await page.goto("/about/vidra");
    expect(aboutSoftware?.status(), "/about/vidra must 404 while white-labelled").toBe(404);
    expect(await sweep(), "/about/vidra names the software").not.toMatch(LEAK);

    // The PWA manifest is public JSON and names the installed app. page.request
    // shares the page's baseURL and cookies, so this is the same document a
    // browser would install from.
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok(), `GET /manifest.webmanifest ${manifest.status()}`).toBeTruthy();
    expect(
      maskInstanceName(await manifest.text(), instanceName),
      "the PWA manifest names the software",
    ).not.toMatch(LEAK);

    await signInAsAdmin(page);
    for (const path of SIGNED_IN_PATHS) {
      await page.goto(path);
      expect(await sweep(), `signed-in surface ${path} names the software`).not.toMatch(LEAK);
    }
  } finally {
    // Hermetic: clear the overlay whatever happened above, so a failure here
    // cannot white-label every other spec sharing this stack.
    await setHideSoftwareName(request, token, null);
  }
});

test("white-label off: the attribution and the software's About page come back", async ({
  page,
  request,
}) => {
  // The regression half. Every instance that never touches this setting must keep
  // today's behavior, and "hidden" must be reversible rather than one-way.
  test.setTimeout(300_000);
  const token = await adminToken(request);
  try {
    await setHideSoftwareName(request, token, false);

    await expect(async () => {
      await page.goto("/login");
      await expect(page.getByText(/Powered by/i)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: CACHE_TTL_BUDGET });

    const aboutSoftware = await page.goto("/about/vidra");
    expect(aboutSoftware?.status(), "/about/vidra serves normally when not hidden").toBe(200);
    await expect(page.getByRole("heading", { name: /powered by/i })).toBeVisible();
  } finally {
    await setHideSoftwareName(request, token, null);
  }
});
