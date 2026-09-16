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
// ONE test in TWO PHASES, not two tests, and hermetic in a `finally`. The setting
// is INSTANCE-WIDE, so two tests would either race each other (fullyParallel) or
// need serial mode — and serial mode is a trap here: Playwright SKIPS the rest of
// a serial group when an earlier test fails, so phase 1 going red would ALSO trip
// the lane's zero-skip audit with an unregistered skip. That was measured, not
// guessed (run 34852976974). A single test makes both directions one outcome.
//
// CROSS-TALK. This test holds an INSTANCE-WIDE flag on for minutes while other
// specs run in parallel against the same stack, so anything asserting the
// software's name meanwhile can see either state. Two do:
//   - peertube-import.spec asserts it on ADMIN copy, which this feature
//     deliberately leaves alone — unaffected either way;
//   - account-export.spec asserts the DOWNLOAD FILENAME, which this feature does
//     change. That assertion now accepts both spellings for exactly this reason
//     (see the comment at its call site).

/** Anything that would name the software or attribute the platform to it. */
const LEAK = /vidra|powered by/i;
// Product imagery has neutral filenames, so the text sweep alone misses it.
const PRODUCT_ICON = /\/(?:icon\.svg|apple-touch-icon\.png|icon-(?:192|512|maskable-512)\.png)(?:\?|$)/;

/**
 * The instance's OWN name is not a leak even when it happens to contain the
 * software's name — an operator who calls their site "Vidra Test" has chosen
 * that, and hiding the software name cannot un-choose it. Masking it keeps the
 * sweep hermetic: it does not have to rename the instance (which would race
 * instance-settings.spec.ts) to stay meaningful. The "powered by" half of LEAK
 * still fires on a masked "Powered by [instance]", so masking cannot hide a real
 * attribution.
 *
 * The name is re-read LIVE before every sweep rather than captured once:
 * instance-settings.spec.ts renames the instance to `Vidra <id>` and never
 * restores it, in parallel, so a stale mask would leave a legitimate instance
 * name unmasked and report a false LEAK.
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
  // CORE-FIRST. The backed lanes build against vidra-core's DEFAULT BRANCH, so
  // until the matching core change merges this PATCH is rejected for an unknown
  // key and this whole file is red — the same correct red the `contract` lane
  // shows, for the same reason. Name it in the failure so nobody debugs the
  // frontend for it.
  expect(
    res.ok(),
    `PATCH instance-settings ${res.status()} for branding_hide_software_name — ` +
      "if this is a 4xx about an unknown key, the vidra-core white-label change " +
      "has not merged to its default branch yet. Land core first, then re-run.",
  ).toBeTruthy();
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
  // The Technical page prints `instance.software.name` verbatim, so it is both
  // the most direct leak and the likeliest place for a future change to un-gate
  // one; /about/instance/home is its sibling and shares the identity header.
  "/about/instance/home",
  "/about/instance/tech",
  "/robots.txt",
  // A guessed URL: the 404 page's own title used to name the software.
  "/this-page-does-not-exist",
] as const;

/** Pages that need a session. */
const SIGNED_IN_PATHS = [
  // Swept first so its snapshot cache entry is known post-PATCH before the
  // export-download step below navigates here: that flow REQUESTS an export, so
  // it cannot itself be wrapped in a retry (a repeat hits the one-active-export
  // 409), and riding the TTL out on a sibling path proves nothing about this one.
  "/settings",
  "/settings/donations",
  "/settings/connections",
  "/settings/security",
] as const;

test("white-label hides the software name everywhere, and turning it off brings it back", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const token = await adminToken(request);
  const sweep = async () =>
    maskInstanceName(await visibleSurface(page), (await instanceAbout(request)).name);
  try {
    // PHASE 1 — hidden: nothing a reader or a crawler can see may name the
    // software.
    await setHideSoftwareName(request, token, true);

    // EVERY path gets its own cache ride-out, not just the first. The setting
    // reaches each server-rendered surface through the ~60s instance-config data
    // cache, and those entries are per-render-path: riding the TTL out on "/"
    // proves nothing about /login's entry, so a bare assertion on the next path
    // could read a snapshot from before the PATCH and report a leak that is
    // really staleness.
    const sweepPath = async (path: string, label: string) => {
      await expect(async () => {
        await page.goto(path);
        expect(await sweep(), `${label} ${path} names the software`).not.toMatch(LEAK);
        const icons = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
        expect(icons.some((href) => href && PRODUCT_ICON.test(href)), `${path} uses a product icon`).toBe(false);
        // Federation badges keep their protocol indicator; only product decoration disappears.
        const productRibbons = ["/login", "/signup", "/reset-password"].includes(path)
          ? ".protocol-ribbon"
          : 'header .protocol-ribbon, [aria-labelledby="about-network-heading"] > div:first-child .protocol-ribbon';
        await expect(page.locator(productRibbons)).toHaveCount(0);
      }).toPass({ timeout: CACHE_TTL_BUDGET });
    };

    for (const path of ANONYMOUS_PATHS) {
      await sweepPath(path, "anonymous surface");
    }

    // /about/vidra is the software's own page: the URL itself is the leak, so it
    // must 404 rather than merely render empty.
    await expect(async () => {
      const res = await page.goto("/about/vidra");
      expect(res?.status(), "/about/vidra must 404 while white-labelled").toBe(404);
      expect(await sweep(), "/about/vidra names the software").not.toMatch(LEAK);
    }).toPass({ timeout: CACHE_TTL_BUDGET });

    // The PWA manifest is public JSON and names the installed app. page.request
    // shares the page's baseURL and cookies, so this is the same document a
    // browser would install from.
    await expect(async () => {
      const manifest = await page.request.get("/manifest.webmanifest");
      expect(manifest.ok(), `GET /manifest.webmanifest ${manifest.status()}`).toBeTruthy();
      expect(
        maskInstanceName(await manifest.text(), (await instanceAbout(request)).name),
        "the PWA manifest names the software",
      ).not.toMatch(LEAK);
      const app = await manifest.json();
      expect(app.icons.length).toBeGreaterThan(0);
      for (const icon of app.icons) expect(icon.src).not.toMatch(PRODUCT_ICON);
    }).toPass({ timeout: CACHE_TTL_BUDGET });

    await signInAsAdmin(page);
    for (const path of SIGNED_IN_PATHS) {
      await sweepPath(path, "signed-in surface");
    }

    // The account export's DOWNLOAD FILENAME is white-labelled too, and it is the
    // one leak a reader keeps on disk. account-export.spec.ts asserts the same
    // filename from the other direction (and tolerates both spellings, because
    // this flag is instance-wide while this test holds it on).
    await page.goto("/settings"); // already ridden out by the sweep loop above
    await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
    await page.getByRole("button", { name: "Request export" }).click();
    const exportDownload = page.getByRole("button", { name: "Download archive" });
    await expect(exportDownload).toBeVisible({ timeout: 60_000 });
    const downloadEvent = page.waitForEvent("download");
    await exportDownload.click();
    expect(
      (await downloadEvent).suggestedFilename(),
      "the export filename must not carry the software name",
    ).toBe("account-export.json");

    // PHASE 2 — the regression half, and the proof that hiding is REVERSIBLE
    // rather than one-way: turn it off and the attribution and the software's own
    // About page come back. Every instance that never touches this setting lives
    // in this state, so it is the half that must never break.
    await setHideSoftwareName(request, token, false);
    await expect(async () => {
      await page.goto("/login");
      await expect(page.getByText(/Powered by/i)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: CACHE_TTL_BUDGET });

    // Same per-path ride-out as every other assertion here, and for the same
    // reason: /about/vidra's 404-or-200 is decided SERVER-side from the instance
    // snapshot, whose data-cache entry for this path is independent of /login's.
    // Riding the TTL out on /login proves nothing about this one.
    await expect(async () => {
      const res = await page.goto("/about/vidra");
      expect(res?.status(), "/about/vidra serves normally when not hidden").toBe(200);
      await expect(page.getByRole("heading", { name: /powered by/i })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: CACHE_TTL_BUDGET });

    // And the Technical page's Software row is back — the positive mirror of the
    // /about/vidra 200 above. Asserted POSITIVELY on purpose: "the row is gone
    // when hidden" is only meaningful if something proves it comes back, or a
    // permanently-omitted row would pass phase 1 forever.
    await expect(async () => {
      await page.goto("/about/instance/tech");
      await expect(page.getByText(/^vidra \S+/)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByText("Software", { exact: true })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: CACHE_TTL_BUDGET });
  } finally {
    // Hermetic: clear the overlay whatever happened above, so a failure here
    // cannot leave every other spec sharing this stack white-labelled.
    await setHideSoftwareName(request, token, null);
  }
});
