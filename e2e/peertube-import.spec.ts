import { expect, test, type Page } from "@playwright/test";

// Mocked admin "Import from PeerTube" coverage (a real backend is not running in
// `npm run ci`; a dry-run against a real configured source is proven — env-gated —
// in e2e-backed/peertube-import.spec.ts). The page only TRIGGERS and MONITORS a
// server-side migration: the source DB/storage connection lives in server config,
// so NO source credentials are ever entered in the browser (asserted below).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
// The collection (GET history + POST launch) vs one run by id (progress poll).
const IMPORT = /\/api\/v1\/admin\/peertube-import$/;
const IMPORT_ONE = /\/api\/v1\/admin\/peertube-import\/[^/]+$/;

type Role = "user" | "moderator" | "admin";

function session(role: Role) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "boss",
      email: "boss@example.test",
      role,
      email_verified: true,
      display_name: "Boss",
      bio: "",
      created_at: new Date().toISOString(),
    },
  };
}

type Run = {
  id: string;
  mode: "dry_run" | "run";
  state: "pending" | "running" | "done" | "failed";
  conflict_policy: "skip" | "rename" | "merge" | "fail";
  source_version?: number;
  acknowledged_schema_version?: number;
  error?: string;
  error_code?: string;
  report?: unknown;
  created_at: string;
  updated_at: string;
};

function run(overrides: Partial<Run>): Run {
  const now = new Date().toISOString();
  return {
    id: "r1",
    mode: "dry_run",
    state: "pending",
    conflict_policy: "skip",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// A dry-run report: writes nothing, tallies the plan + conflicts + deferred kinds.
const dryReport = {
  source_version: 810,
  dry_run: true,
  conflict_policy: "rename",
  entities: {
    user: { planned: 12, imported: 0, skipped: 2, failed: 0, unsupported: 0 },
    channel: { planned: 8, imported: 0, skipped: 1, failed: 0, unsupported: 0 },
    video: { planned: 140, imported: 0, skipped: 0, failed: 1, unsupported: 3 },
  },
  deferred: ["plugins", "themes"],
  conflicts: [
    'user "alice" already exists — will import as "alice2"',
    'channel slug "news" taken — will import as "news-1"',
  ],
};

// A real-import report: the summary of what was actually written.
const runReport = {
  source_version: 810,
  dry_run: false,
  conflict_policy: "skip",
  entities: {
    user: { planned: 12, imported: 10, skipped: 2, failed: 0, unsupported: 0 },
    channel: { planned: 8, imported: 7, skipped: 1, failed: 0, unsupported: 0 },
    video: { planned: 140, imported: 136, skipped: 0, failed: 1, unsupported: 3 },
  },
};

// Preflight refused the source for its schema version: a FAILED run carrying the
// refusal class (error_code) plus the number the admin has to be shown before
// they can be asked to accept it. This is the ONE refusal a browser may overrule.
const unverified = () =>
  run({
    id: "r9",
    mode: "dry_run",
    state: "failed",
    conflict_policy: "skip",
    source_version: 1040,
    error_code: "unverified_schema",
    error: "source schema version 1040 is outside the importer's verified range (max 1000)",
  });

// The sibling refusal: no version could be read from the source at all. There is
// no number to name, so it is NOT acknowledgeable from here at any price.
const undetectable = () =>
  run({
    id: "r8",
    mode: "dry_run",
    state: "failed",
    conflict_policy: "skip",
    error_code: "undetectable_schema",
    error: "could not read application.migrationVersion from the source database",
  });

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// Client-side nav keeps the in-memory session (a hard reload lands signed out).
async function openImport(page: Page) {
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Import", exact: true }).click();
}

test("anonymous viewers are gated out of the PeerTube import page", async ({ page }) => {
  let fetched = false;
  await page.route(IMPORT, (route) => {
    fetched = true;
    return route.fulfill({ json: { runs: [] } });
  });
  await page.goto("/admin/import-peertube");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular user gets no admin entry and is gated from the import page", async ({ page }) => {
  await signIn(page, "user");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(IMPORT, (route) => {
    fetched = true;
    return route.fulfill({ json: { runs: [] } });
  });
  await page.goto("/admin/import-peertube");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin runs a dry run and sees the mapping, counts, and conflicts", async ({ page }) => {
  await signIn(page, "admin");

  let launchBody: unknown = null;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      launchBody = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        json: run({ id: "r1", mode: "dry_run", state: "pending", conflict_policy: "rename" }),
      });
    }
    return route.fulfill({ json: { runs: [] } });
  });
  // The progress poll resolves the launched run to done + the dry-run report.
  await page.route(IMPORT_ONE, (route) =>
    route.fulfill({
      json: run({
        id: "r1",
        mode: "dry_run",
        state: "done",
        conflict_policy: "rename",
        source_version: 810,
        report: dryReport,
      }),
    }),
  );

  await openImport(page);

  // The source connection is server-side — the browser never asks for credentials.
  await expect(
    page.getByText("Vidra never asks for or accepts your PeerTube database or storage credentials"),
  ).toBeVisible();
  expect(await page.locator('input[type="password"]').count()).toBe(0);

  // Pick a conflict policy, then preview (a dry run writes nothing).
  await page.getByLabel("Conflict policy").selectOption("rename");
  await page.getByRole("button", { name: "Preview (dry run)" }).click();

  // Progress → the plan/mapping report.
  await expect(page.getByRole("heading", { name: "Dry run preview" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByRole("rowheader", { name: "video" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "140" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "planned" })).toBeVisible();

  // Conflicts + intentionally-not-migrated families.
  await expect(page.getByRole("heading", { name: "Conflicts (2)" })).toBeVisible();
  await expect(page.getByText('user "alice" already exists — will import as "alice2"')).toBeVisible();
  await expect(page.getByRole("heading", { name: /Not migrated/ })).toBeVisible();
  await expect(page.getByText("plugins", { exact: true })).toBeVisible();

  // The launch carried the mode + policy only — never a source credential.
  expect(launchBody).toEqual({ mode: "dry_run", conflict_policy: "rename" });
});

test("an admin starts a real import and watches it run to completion", async ({ page }) => {
  await signIn(page, "admin");

  let launchBody: unknown = null;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      launchBody = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        json: run({ id: "r2", mode: "run", state: "running", conflict_policy: "skip" }),
      });
    }
    return route.fulfill({ json: { runs: [] } });
  });
  await page.route(IMPORT_ONE, (route) =>
    route.fulfill({
      json: run({
        id: "r2",
        mode: "run",
        state: "done",
        conflict_policy: "skip",
        source_version: 810,
        report: runReport,
      }),
    }),
  );

  await openImport(page);
  await page.getByRole("button", { name: "Start import" }).click();

  // Start → progress: the in-flight spinner is shown while the run is running.
  await expect(page.getByText("Importing content from the source…")).toBeVisible();
  const runRegion = page.getByRole("region", { name: "Import run" });
  await expect(runRegion.getByRole("heading", { name: "Import run" })).toBeVisible();

  // The poll resolves the run to done → the migration summary renders. `state`
  // is the state of the RUN, not of its contents: this one reached the end with
  // a video inside it failed, so it is deliberately NOT badged as a success,
  // and the warning names the family rather than leaving a red cell to be spotted.
  await expect(runRegion.getByText("Finished with failures")).toBeVisible();
  await expect(runRegion.getByText("Done")).toHaveCount(0);
  await expect(runRegion.getByRole("alert")).toContainText("video 1");
  await expect(
    page.getByText("The migration summary below reflects what was written."),
  ).toBeVisible();
  // Whole-body equality, so this also proves `source_authoritative` is ABSENT
  // (not sent as false) when the cutover box was never ticked.
  expect(launchBody).toEqual({ mode: "run", conflict_policy: "skip" });
});

test("when no PeerTube source is configured, the operator sees guidance not a form", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "import_not_configured",
            message: "PeerTube import is not configured on this instance.",
          },
        },
      });
    }
    return route.fulfill({ json: { runs: [] } });
  });

  await openImport(page);
  await page.getByRole("button", { name: "Preview (dry run)" }).click();

  // The instance has no source → operator guidance pointing at the server config,
  // never a credential form.
  await expect(page.getByText("PeerTube import is not set up on this instance")).toBeVisible();
  await expect(page.getByText("source credentials are never entered here")).toBeVisible();
  // The launch controls are replaced by guidance, and no credential input exists.
  await expect(page.getByRole("button", { name: "Preview (dry run)" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start import" })).toHaveCount(0);
  expect(await page.locator('input[type="password"]').count()).toBe(0);
});

test("a preview refused for an unverified schema names the detected version", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 202,
        json: run({ id: "r9", mode: "dry_run", state: "pending" }),
      });
    }
    return route.fulfill({ json: { runs: [] } });
  });
  // A dry run reaches version detection before it writes anything, so a refused
  // PREVIEW is how the operator discovers which version their source reports.
  await page.route(IMPORT_ONE, (route) => route.fulfill({ json: unverified() }));

  await openImport(page);
  await page.getByRole("button", { name: "Preview (dry run)" }).click();

  const launchSection = page.getByRole("region", { name: "Launch an import" });
  await expect(
    launchSection.getByRole("heading", {
      name: /The source reports PeerTube schema v1040, which this importer has not been verified against/,
    }),
  ).toBeVisible();
  // The risk is stated plainly, not smoothed over.
  await expect(
    page.getByText("those columns may have been renamed, retyped, or removed"),
  ).toBeVisible();
  // The tick names the version — an admin who never read the refusal cannot give it.
  await expect(
    launchSection.getByRole("checkbox", { name: /I accept PeerTube schema v1040 for this run/ }),
  ).toBeVisible();
});

test("both launch buttons stay dead until the unverified version is acknowledged", async ({
  page,
}) => {
  await signIn(page, "admin");
  let launched = false;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      launched = true;
      return route.fulfill({ status: 202, json: run({ id: "r10", state: "pending" }) });
    }
    // The refusal is the newest run in the history, so a reload lands straight
    // back on the decision rather than losing it.
    return route.fulfill({ json: { runs: [unverified()] } });
  });

  await openImport(page);
  const preview = page.getByRole("button", { name: "Preview (dry run)" });
  const start = page.getByRole("button", { name: "Start import" });
  await expect(preview).toBeDisabled();
  await expect(start).toBeDisabled();

  // Even forced, a disabled control launches nothing.
  await preview.click({ force: true });
  await start.click({ force: true });
  expect(launched).toBe(false);

  // Ticking the version — and only that — opens both.
  await page.getByRole("checkbox", { name: /I accept PeerTube schema v1040/ }).check();
  await expect(preview).toBeEnabled();
  await expect(start).toBeEnabled();
});

test("acknowledging sends the exact detected version as acknowledged_schema_version", async ({
  page,
}) => {
  await signIn(page, "admin");
  let launchBody: unknown = null;
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      launchBody = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        json: run({ id: "r10", mode: "dry_run", state: "pending", conflict_policy: "skip" }),
      });
    }
    return route.fulfill({ json: { runs: [unverified()] } });
  });
  await page.route(IMPORT_ONE, (route) =>
    route.fulfill({
      json: run({
        id: "r10",
        mode: "dry_run",
        state: "done",
        conflict_policy: "skip",
        source_version: 1040,
        acknowledged_schema_version: 1040,
        report: dryReport,
      }),
    }),
  );

  await openImport(page);
  await page.getByRole("checkbox", { name: /I accept PeerTube schema v1040/ }).check();
  await page.getByRole("button", { name: "Preview (dry run)" }).click();

  // The run goes through, and the decision travelled as the version itself.
  await expect(page.getByRole("heading", { name: "Dry run preview" })).toBeVisible();
  expect(launchBody).toEqual({
    mode: "dry_run",
    conflict_policy: "skip",
    acknowledged_schema_version: 1040,
  });
});

test("the acknowledgement is per-run: the next launch carries none", async ({ page }) => {
  await signIn(page, "admin");
  const bodies: Record<string, unknown>[] = [];
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      bodies.push(body);
      const id = bodies.length === 1 ? "r10" : "r11";
      return route.fulfill({
        status: 202,
        json: run({ id, mode: body.mode as Run["mode"], state: "pending" }),
      });
    }
    return route.fulfill({ json: { runs: [unverified()] } });
  });
  await page.route(IMPORT_ONE, (route) => {
    const id = route.request().url().split("/").pop() ?? "";
    const dry = id === "r10";
    return route.fulfill({
      json: run({
        id,
        mode: dry ? "dry_run" : "run",
        state: "done",
        source_version: 1040,
        acknowledged_schema_version: dry ? 1040 : undefined,
        report: dry ? dryReport : runReport,
      }),
    });
  });

  await openImport(page);
  await page.getByRole("checkbox", { name: /I accept PeerTube schema v1040/ }).check();
  await page.getByRole("button", { name: "Preview (dry run)" }).click();
  await expect(page.getByRole("heading", { name: "Dry run preview" })).toBeVisible();

  // A second launch, with nothing re-ticked in between: the sign-off was spent
  // by the run it authorised and must NOT ride along silently.
  await page.getByRole("button", { name: "Start import" }).click();
  await expect(
    page.getByText("The migration summary below reflects what was written."),
  ).toBeVisible();

  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual({
    mode: "dry_run",
    conflict_policy: "skip",
    acknowledged_schema_version: 1040,
  });
  expect(bodies[1]).toEqual({ mode: "run", conflict_policy: "skip" });
  expect("acknowledged_schema_version" in bodies[1]).toBe(false);
});

test("an undetectable schema version offers no acknowledgement at all", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(IMPORT, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 202, json: run({ id: "r10", state: "pending" }) });
    }
    return route.fulfill({ json: { runs: [undetectable()] } });
  });

  await openImport(page);
  const launchSection = page.getByRole("region", { name: "Launch an import" });
  await expect(
    launchSection.getByRole("heading", { name: "No schema version could be read from the source" }),
  ).toBeVisible();
  // Nothing to name means no SIGN-OFF to tick — this refusal needs a human on
  // the CLI. Asked by name, because the unrelated cutover box still stands.
  await expect(
    launchSection.getByRole("checkbox", { name: /I accept PeerTube schema/ }),
  ).toHaveCount(0);
  await expect(page.getByText("peertube-import --force")).toBeVisible();
});
