import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API_URL,
  registerUser,
  seedPublishedChannel,
} from "./fixtures";

/*
 * QLT-02 / A40 — the required-control walk, against a REAL vidra-core.
 *
 * Every route below is one a PASS register row's procedure names, and the walk
 * measures the four dimensions that row asks for on each of them: it does not
 * pan sideways on a phone, no control is a target too small to hit, no control
 * is clipped out of an overflow-hidden ancestor, and axe finds no serious or
 * critical violation in EITHER theme. The widths are the two the record says
 * are the real worst cases: 390 px (the bottom-tab phone) and 640 px (the
 * desktop stage the sidebar squeezes hardest — NOT 320 px, and not a viewport
 * `responsive.spec.ts` can see, because it is mocked and signed out).
 *
 * Horizontal pan is measured by actually trying to pan (`scrollTo` then read
 * `scrollX`), not by comparing `scrollWidth`: the two admin tables this walk
 * found could be swiped 622 px and 859 px into blank space while
 * `document.body.scrollWidth` read a perfectly innocent 390.
 */

const PHONE = { width: 390, height: 844 };
const STAGE = { width: 640, height: 900 };

type Role = "anon" | "admin" | "creator";

/**
 * Sign in through the API in cookie mode, sharing the page's cookie jar. NOT a
 * shortcut around the UI: the refresh token rotates and is single-use, so the
 * storageState trick every other harness reaches for presents an already-rotated
 * token on the second context — which core correctly treats as compromise and
 * answers by revoking every session for that account.
 */
async function signIn(page: Page, identifier: string, password: string): Promise<void> {
  const res = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { identifier, password, cookie_mode: true },
  });
  expect(res.status(), `sign-in for ${identifier}`).toBe(200);
  const jar = await page.context().cookies();
  expect(jar.map((c) => c.name), `cookie-mode session for ${identifier}`).toContain("vidra_refresh");
}

/** Try to pan the page sideways; a well-behaved surface does not move. */
async function panOffset(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(4000, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x;
  });
}

type Control = { name: string; w: number; h: number; path: string; clipped: string | null };

/**
 * Every visible interactive control on the page, with the two measurements this
 * row cares about: its hit target, and whether an overflow-hidden ancestor has
 * cut it off (the bug class the player's speed menu shipped with — seven of
 * twelve rungs untappable inside the stage's `overflow-hidden`).
 */
async function controls(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const SEL =
      'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=menuitem],[role=menuitemradio],[role=tab],[role=switch],[role=checkbox],[role=slider],[tabindex]:not([tabindex="-1"])';
    const path = (el: Element) => {
      const bits: string[] = [];
      for (let n: Element | null = el; n && bits.length < 3; n = n.parentElement) {
        let b = n.tagName.toLowerCase();
        if (n.id) { bits.unshift(`${b}#${n.id}`); break; }
        if (n.classList.length) b += `.${[...n.classList].slice(0, 2).join(".")}`;
        bits.unshift(b);
      }
      return bits.join(">");
    };
    const out: Control[] = [];
    for (const el of Array.from(document.querySelectorAll(SEL))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0) continue;
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      // The skip link is deliberately parked outside the viewport until focused.
      if (el.classList.contains("skip-link")) continue;
      // Clipping is decided by the NEAREST ancestor that is not `overflow:
      // visible`: if that one scrolls, the control is reachable (the studio tab
      // rail and the admin language list both look cut off and are not); only a
      // hidden/clip box actually puts it out of reach.
      let clipped: string | null = null;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const p = getComputedStyle(n);
        const nonVisible = /hidden|clip|auto|scroll/.test(p.overflowX) || /hidden|clip|auto|scroll/.test(p.overflowY);
        if (!nonVisible) continue;
        if (/auto|scroll/.test(p.overflowX) || /auto|scroll/.test(p.overflowY)) break;
        const pr = n.getBoundingClientRect();
        const ix = Math.max(0, Math.min(r.right, pr.right) - Math.max(r.left, pr.left));
        const iy = Math.max(0, Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top));
        if ((ix * iy) / Math.max(1, r.width * r.height) < 0.6) {
          clipped = `${path(n)} (overflow ${p.overflowX}/${p.overflowY})`;
        }
        break;
      }
      // The EFFECTIVE hit target: a bare checkbox is 16 px, but the label that
      // wraps it is what a finger lands on, and that is the row.
      const labelled = el.closest("label") ?? (el as HTMLInputElement).labels?.[0] ?? null;
      const t = labelled ? labelled.getBoundingClientRect() : r;
      out.push({
        name: (el.getAttribute("aria-label") || (el.textContent || "").trim()).replace(/\s+/g, " ").slice(0, 50),
        w: Math.round(Math.max(r.width, t.width)),
        h: Math.round(Math.max(r.height, t.height)),
        path: path(el),
        clipped,
      });
    }
    return out;
  });
}

async function severeAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.html.slice(0, 120)}`);
}

let seeded: { handle: string; videoId: string };
let walker: { username: string };

test.beforeAll(async ({ request }) => {
  seeded = await seedPublishedChannel(request);
  // A plain signed-in account for the viewer/creator surfaces. seedPublishedChannel
  // does not surrender its owner's username, and every one of these routes is
  // about the shape of the screen, not about whose data is on it.
  walker = await registerUser(request, "a40");
});

// The inventory. `rows` names the register row whose procedure reaches this
// screen — the link this acceptance is asked for, kept beside the route it
// covers so a new screen cannot be added without one.
function inventory() {
  return [
    { path: "/", role: "anon" as Role, rows: "SRC-03/SOC-01", name: "home" },
    { path: "/trending", role: "anon" as Role, rows: "SRC-03", name: "trending" },
    { path: "/search?q=video", role: "anon" as Role, rows: "SRC-01", name: "search" },
    { path: `/channels/${seeded.handle}`, role: "anon" as Role, rows: "PUB-01", name: "channel" },
    { path: `/videos/${seeded.videoId}`, role: "anon" as Role, rows: "PLAY-01/SOC-02", name: "watch" },
    { path: "/playlists", role: "anon" as Role, rows: "SOC-01", name: "playlists" },
    { path: "/login", role: "anon" as Role, rows: "AUTH-02", name: "login" },
    { path: "/signup", role: "anon" as Role, rows: "AUTH-02", name: "signup" },
    { path: "/reset-password", role: "anon" as Role, rows: "AUTH-03", name: "reset password" },
    { path: "/a40-no-such-route", role: "anon" as Role, rows: "QLT-02", name: "404" },
    { path: "/settings", role: "creator" as Role, rows: "AUTH-05", name: "settings" },
    { path: "/settings/security", role: "creator" as Role, rows: "AUTH-04", name: "settings security" },
    { path: "/messages", role: "creator" as Role, rows: "MSG-01", name: "messages" },
    { path: "/studio/content", role: "creator" as Role, rows: "PUB-01/CRT-01", name: "studio content" },
    { path: "/admin/users", role: "admin" as Role, rows: "ADM-01", name: "admin users" },
    { path: "/admin/jobs", role: "admin" as Role, rows: "ADM-04", name: "admin jobs" },
    { path: "/admin/config/general", role: "admin" as Role, rows: "ADM-03", name: "admin config" },
    { path: "/admin/infrastructure", role: "admin" as Role, rows: "ADM-04", name: "admin infrastructure" },
    { path: "/moderation/videos", role: "admin" as Role, rows: "ADM-02", name: "moderation videos" },
  ];
}

for (const width of [PHONE, STAGE]) {
  test(`required screens neither pan nor clip their controls at ${width.width}px`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(width);
    const failures: string[] = [];
    for (const route of inventory()) {
      if (route.role === "admin") await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      else if (route.role === "creator") await signIn(page, walker.username, "supersecret-e2e");
      await page.goto(route.path);
      await page.waitForTimeout(2500);

      const pan = await panOffset(page);
      if (pan > 1) failures.push(`${route.name} [${route.rows}] pans ${pan}px sideways`);

      for (const c of await controls(page)) {
        // WCAG 2.5.8 AA's floor. A control smaller than this in BOTH dimensions
        // is a target nothing can reliably hit; a wide-but-short text link is
        // covered by the spacing exception and is not counted here.
        if (c.w < 24 && c.h < 24) failures.push(`${route.name} [${route.rows}] target ${c.w}x${c.h} "${c.name}" ${c.path}`);
        if (c.clipped) failures.push(`${route.name} [${route.rows}] "${c.name}" clipped by ${c.clipped}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`required screens carry no serious accessibility violation in ${theme}`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(STAGE);
    await page.emulateMedia({ colorScheme: theme });
    const failures: string[] = [];
    for (const route of inventory()) {
      if (route.role === "admin") await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      else if (route.role === "creator") await signIn(page, walker.username, "supersecret-e2e");
      await page.goto(route.path);
      await page.waitForTimeout(2500);
      // Both theme paths must be legible: the emulated `prefers-color-scheme`
      // above, and the explicit `data-theme` the in-app switch writes.
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(200);
      for (const v of await severeAxe(page)) failures.push(`${route.name} [${route.rows}] ${v}`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test("the account menu opens by keyboard, closes on Escape and hands focus back", async ({ page }) => {
  await signIn(page, walker.username, "supersecret-e2e");
  await page.goto("/");

  const opener = page.getByRole("button", { name: "Open account menu" });
  await expect(opener).toBeVisible();
  await opener.focus();
  // A visible focus indicator is a required control's minimum, and a
  // `visibility:hidden` pre-measure has silently killed focus() here before.
  const ring = await opener.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { outline: cs.outlineStyle, width: cs.outlineWidth, shadow: cs.boxShadow };
  });
  expect(ring.outline !== "none" || ring.shadow !== "none").toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Account menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Account menu" })).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("a watch page whose media cannot be fetched says so and offers a retry", async ({ page }) => {
  // The A32/A33 finding: with the object store down every source failed and the
  // stage rendered a dead 0:00/0:00 with no message anywhere in the DOM.
  await page.route(/\/api\/v1\/videos\/[^/]+\/(original|hls\/)/, (route) =>
    route.fulfill({ status: 503, body: '{"error":{"code":"storage_unavailable"}}' }),
  );
  await page.goto(`/videos/${seeded.videoId}`);
  const alert = page.getByRole("alert").filter({ hasText: /could not be played/i });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("player speed and volume survive a reload and a second tab", async ({ page, context }) => {
  await page.goto(`/videos/${seeded.videoId}`);
  await page.getByRole("button", { name: /^Speed/ }).first().click();
  await page.getByRole("menuitemradio", { name: "1.5×" }).click();
  await expect(page.getByRole("button", { name: "Speed: 1.5×" })).toBeVisible();

  const volume = page.getByRole("slider", { name: "Volume" });
  await volume.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowDown");
  const set = await page.evaluate(() => document.querySelector("video")?.volume ?? null);
  expect(set).not.toBeNull();
  expect(set).toBeLessThan(1);

  await page.reload();
  await expect(page.getByRole("button", { name: "Speed: 1.5×" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.querySelector("video")?.volume ?? null))
    .toBeCloseTo(set as number, 2);

  // A second tab in the same browser. Volume is a DEVICE preference and must be
  // there before the viewer touches anything; speed is deliberately
  // session-scoped (lib/player-rates.ts stores it in sessionStorage), so the new
  // tab correctly opens at the default — asserted so the split stays deliberate.
  const tab = await context.newPage();
  await tab.goto(`/videos/${seeded.videoId}`);
  await expect(tab.getByRole("button", { name: "Speed: 1×" })).toBeVisible();
  await expect
    .poll(() => tab.evaluate(() => document.querySelector("video")?.volume ?? null))
    .toBeCloseTo(set as number, 2);
  await tab.close();
});
