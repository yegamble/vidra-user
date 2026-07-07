// W0 design-parity capture harness (backport programme W0.1).
//
// Screenshots one or more app "areas" in every combination of viewport
// (mobile + desktop) and theme (light + dark) into
// `.ralph/design-review/w0/<area>/<viewport>-<theme>.png` — the git-ignored
// evidence folder each W0 slice attaches before/after to its fix_plan note.
//
// It is a DEV tool, never part of `npm run ci` (it lives under scripts/, so the
// no-console lint rule and tsc's *.ts globs both skip it — same as the other
// .mjs scripts). No real backend is required: each area installs its own
// `page.route` mocks (identical technique to the mocked e2e specs), and any
// other /api/v1/* call is aborted so the page renders its signed-out/empty
// state instead of hanging on a refused connection.
//
// Theme note: the app follows `prefers-color-scheme` when no theme is pinned
// (lib/theme.ts default "system" sets no data-theme attribute), so emulating
// the color scheme per browser context is all that's needed to flip every
// `light-dark()` token — no localStorage manipulation.
//
// Usage:
//   E2E_PORT=3181 npm run dev                       # start the app (any port)
//   DESIGN_BASE_URL=http://localhost:3181 npm run design:shots            # all areas
//   DESIGN_BASE_URL=http://localhost:3181 npm run design:shots -- home    # one area
//   DESIGN_FULLPAGE=1 ... npm run design:shots       # capture full scroll height
//
// Add an area: extend AREAS below with { path, mock } — the mock installs the
// route stubs that area needs (registered after the abort fallback, so they win).

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const PORT = process.env.E2E_PORT ?? process.env.PORT ?? "3000";
const BASE_URL = (process.env.DESIGN_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const OUT_ROOT = path.join(".ralph", "design-review", "w0");
const FULL_PAGE = process.env.DESIGN_FULLPAGE === "1";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const THEMES = /** @type {const} */ (["light", "dark"]);

// ---- sample fixtures (illustrative only — never real user data) --------------

function sampleVideo(id, title, opts = {}) {
  return {
    id,
    channel_id: opts.channelId ?? "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date(Date.now() - (opts.ageDays ?? 1) * 86_400_000).toISOString(),
    views: opts.views ?? 0,
    has_thumbnail: false,
    duration_seconds: opts.duration,
    channel_handle: opts.handle ?? "grade-house",
    channel_display_name: opts.channel ?? "Grade House",
  };
}

const SAMPLE_FEED = {
  videos: [
    sampleVideo("v1", "Late-night color grading session", { views: 1200, duration: 1830, ageDays: 0 }),
    sampleVideo("v2", "Shooting the Alps on medium format — a field diary", {
      views: 128_000, duration: 1456, ageDays: 2, handle: "aurora-lab", channel: "Aurora Lab",
    }),
    sampleVideo("v3", "Building a federated video pipeline in Go", {
      views: 42_000, duration: 1083, ageDays: 5, handle: "north-loop", channel: "North Loop",
    }),
    sampleVideo("v4", "Monochrome grading — the luxury look, by hand", { views: 96_000, duration: 1900, ageDays: 7 }),
    sampleVideo("v5", "The quiet web: why federation matters", {
      views: 210_000, duration: 742, ageDays: 21, handle: "field-notes", channel: "Field Notes",
    }),
    sampleVideo("v6", "Printing silver gelatin at home — full darkroom setup", {
      views: 64_000, duration: 1671, ageDays: 30, handle: "aurora-lab", channel: "Aurora Lab",
    }),
  ],
  sort: "recent",
  limit: 20,
  offset: 0,
};

const SAMPLE_VIDEO_CONFIG = { categories: [], languages: [], licenses: [] };

// A signed-in session for shell captures. restoreSession() does a silent
// POST /auth/refresh on boot; success then reads GET /auth/me — mocking both
// lands the shell authed (so the sidebar FOLLOWING group and the account menu
// render) without any UI login flow. Illustrative data only.
const SAMPLE_USER = {
  id: "u1",
  username: "boss",
  email: "boss@example.test",
  role: "user",
  email_verified: true,
  display_name: "Mara",
  bio: "",
  created_at: new Date().toISOString(),
};

const SAMPLE_AUTH = {
  token: "design-shots-access",
  refresh_token: "design-shots-refresh",
  token_type: "Bearer",
  expires_in: 900,
  user: SAMPLE_USER,
};

function sampleFollowedChannel(id, handle, displayName) {
  return {
    id,
    owner_id: `${id}-owner`,
    handle,
    display_name: displayName,
    description: "",
    follower_count: 1200,
    created_at: new Date().toISOString(),
    has_avatar: false,
    has_banner: false,
    followed_at: new Date().toISOString(),
  };
}

const SAMPLE_FOLLOWING = {
  channels: [
    sampleFollowedChannel("ch1", "grade_house", "Grade House"),
    sampleFollowedChannel("ch2", "north_loop", "North Loop"),
    sampleFollowedChannel("ch3", "field_notes", "Field Notes"),
  ],
  limit: 15,
  offset: 0,
};

// ---- area registry -----------------------------------------------------------

/** @type {Record<string, { path: string, mock?: (page: import("@playwright/test").Page) => Promise<void> }>} */
const AREAS = {
  home: {
    path: "/",
    async mock(page) {
      // Feed endpoint but not its subpaths (/videos/search, /videos/config, /videos/{id}).
      await page.route(/\/api\/v1\/videos(\?|$)/, (route) => route.fulfill({ json: SAMPLE_FEED }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG }),
      );
    },
  },
  // Signed-in desktop app shell (backport W0.2): exercises the sidebar FOLLOWING
  // group (GET /me/subscriptions) and the header's bell-with-dot + account menu.
  shell: {
    path: "/",
    async mock(page) {
      await page.route(/\/api\/v1\/videos(\?|$)/, (route) => route.fulfill({ json: SAMPLE_FEED }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG }),
      );
      await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: SAMPLE_AUTH }));
      await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: SAMPLE_USER }));
      await page.route(/\/api\/v1\/me\/subscriptions(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_FOLLOWING }),
      );
      await page.route(/\/api\/v1\/me\/notifications\/unread-count$/, (route) =>
        route.fulfill({ json: { unread_count: 3 } }),
      );
    },
  },
};

// ---- capture -----------------------------------------------------------------

async function reachable(url) {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(AREAS);
  const unknown = names.filter((n) => !AREAS[n]);
  if (unknown.length) {
    console.error(`Unknown area(s): ${unknown.join(", ")}. Known: ${Object.keys(AREAS).join(", ")}`);
    process.exit(1);
  }

  if (!(await reachable(BASE_URL))) {
    console.error(
      `Cannot reach ${BASE_URL}. Start the app first, e.g.:\n` +
        `  E2E_PORT=3181 npm run dev\n` +
        `then re-run with DESIGN_BASE_URL=http://localhost:3181 npm run design:shots`,
    );
    process.exit(1);
  }

  const browser = await chromium.launch();
  const written = [];
  try {
    for (const name of names) {
      const area = AREAS[name];
      const dir = path.join(OUT_ROOT, name);
      await mkdir(dir, { recursive: true });
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 2,
            colorScheme: theme,
          });
          const page = await context.newPage();
          // Fallback FIRST so per-area mocks (registered after) take priority in
          // Playwright's last-registered-wins routing; anything unmocked aborts
          // instead of hanging on a refused backend connection.
          await page.route(/\/api\/v1\//, (route) => route.abort());
          if (area.mock) await area.mock(page);

          await page.goto(`${BASE_URL}${area.path}`, { waitUntil: "networkidle" });
          const file = path.join(dir, `${viewport.name}-${theme}.png`);
          await page.screenshot({ path: file, fullPage: FULL_PAGE });
          written.push(file);
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`Captured ${written.length} screenshot(s) into ${OUT_ROOT}/:`);
  for (const file of written) console.log(`  ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
