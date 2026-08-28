import { expect, test, type Page } from "@playwright/test";

// Mocked admin jobs/worker-status coverage (a real backend is not running in
// `npm run ci`; the read against the real stack is a read-only page).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const JOBS = /\/api\/v1\/admin\/jobs$/;
const JOB_RUNS = /\/api\/v1\/admin\/jobs\/runs(\?|$)/;
const JOB_DETAIL = /\/api\/v1\/admin\/jobs\/runs\/[^/?]+(\?|$)/;
const JOB_EVENTS = /\/api\/v1\/admin\/jobs\/events(\?|$)/;

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

const jobs = {
  queues: [
    {
      queue: "transcode_jobs",
      pending: 2,
      running: 1,
      done: 40,
      failed: 0,
      oldest_pending_age_seconds: 45,
    },
    {
      queue: "federation_deliveries",
      pending: 0,
      running: 0,
      done: 100,
      failed: 3,
      oldest_pending_age_seconds: 0,
    },
  ],
  recent_failures: [
    {
      queue: "federation_deliveries",
      id: "11111111-1111-1111-1111-111111111111",
      error: "connection refused",
      attempts: 5,
      failed_at: "2026-07-03T10:00:00Z",
    },
  ],
};

function jobRun(
  id: string,
  type: string,
  state: "running" | "failed" | "succeeded" = "running",
) {
  return {
    id,
    type,
    queue: type === "video_import" ? "import_jobs" : "transcode_jobs",
    state,
    stage: state === "running" ? "encoding_hls" : "finished",
    progress_percent: state === "running" ? 42 : 100,
    priority: 0,
    attempt: state === "failed" ? 3 : 1,
    max_attempts: 3,
    resource_type: "video",
    resource_id: `video-${id.slice(0, 4)}`,
    request_id: "req-1",
    correlation_id: "corr-1",
    trace_id: "0af7651916cd43dd8448eb211c80319c",
    worker_id: "worker-a",
    created_at: "2026-07-03T09:55:00Z",
    started_at: "2026-07-03T09:56:00Z",
    updated_at: "2026-07-03T10:00:00Z",
    finished_at: state === "running" ? undefined : "2026-07-03T10:00:00Z",
    input_metadata: { resolver: "direct_http" },
    output_metadata: state === "succeeded" ? { items: 3 } : {},
    error_class: state === "failed" ? "transient" : undefined,
    error_code: state === "failed" ? "upstream_unavailable" : undefined,
    error_detail: state === "failed" ? "Upstream connection was refused (credentials redacted)." : undefined,
    error_retryable: state === "failed" ? true : undefined,
  };
}

const runA = jobRun("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "video_transcode");
const runB = jobRun("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "video_import", "failed");

const runsResponse = {
  runs: [runA, runB],
  total: 2,
  limit: 25,
  offset: 0,
  event_cursor: "90071992547409930001",
};

const detailResponse = {
  run: runB,
  events: [
    {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      cursor: "90071992547409930001",
      job_id: runB.id,
      kind: "failed",
      state: "failed",
      stage: "finished",
      progress_percent: 100,
      attempt: 3,
      worker_id: "worker-a",
      message: "Import attempt failed safely.",
      metadata: { reason_code: "upstream_unavailable" },
      request_id: "req-1",
      correlation_id: "corr-1",
      trace_id: "0af7651916cd43dd8448eb211c80319c",
      occurred_at: "2026-07-03T10:00:00Z",
    },
  ],
  events_total: 1,
  events_limit: 50,
  events_offset: 0,
  event_cursor: "90071992547409930001",
};

async function routeJobOperations(page: Page) {
  await page.route(JOB_RUNS, (route) => route.fulfill({ json: runsResponse }));
  await page.route(JOB_DETAIL, (route) => route.fulfill({ json: detailResponse }));
  await page.route(JOB_EVENTS, (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: ": heartbeat\n\n",
    }),
  );
}

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

async function openJobs(page: Page) {
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Admin console" })
    .getByRole("link", { name: "Jobs" })
    .click();
}

test("anonymous viewers are gated out of the jobs page", async ({ page }) => {
  let fetched = false;
  await page.route(JOBS, (route) => {
    fetched = true;
    return route.fulfill({ json: jobs });
  });
  await page.route(JOB_RUNS, (route) => {
    fetched = true;
    return route.fulfill({ json: runsResponse });
  });
  await page.route(JOB_EVENTS, (route) => {
    fetched = true;
    return route.fulfill({ body: "" });
  });
  await page.goto("/admin/jobs");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular user gets no admin entry and is gated from jobs", async ({ page }) => {
  await signIn(page, "user");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(JOBS, (route) => {
    fetched = true;
    return route.fulfill({ json: jobs });
  });
  await page.route(JOB_RUNS, (route) => {
    fetched = true;
    return route.fulfill({ json: runsResponse });
  });
  await page.route(JOB_EVENTS, (route) => {
    fetched = true;
    return route.fulfill({ body: "" });
  });
  await page.goto("/admin/jobs");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees per-queue cards, recent failures, and can refresh", async ({ page }) => {
  await signIn(page, "admin");
  await routeJobOperations(page);
  let calls = 0;
  await page.route(JOBS, (route) => {
    calls += 1;
    return route.fulfill({ json: jobs });
  });
  await openJobs(page);

  // Per-queue cards (scoped to the queue grid — the queue name also appears in
  // the failures table below).
  const queueList = page.getByRole("list", { name: "Job queues" });
  await expect(queueList.getByText("transcode_jobs")).toBeVisible();
  await expect(queueList.getByText("federation_deliveries")).toBeVisible();
  // The failed queue is flagged.
  await expect(page.getByText("3 failed")).toBeVisible();

  // Recent-failures table.
  await expect(page.getByRole("heading", { name: "Recent failures" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "connection refused" })).toBeVisible();

  // Individual unified executions are visible alongside the legacy queue snapshot.
  const executions = page.getByRole("table", { name: "Job executions" });
  await expect(executions.getByText("video_transcode")).toBeVisible();
  await expect(executions.getByText("video_import")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Executions" })
      .getByText(/^(Live|Connecting|Polling fallback)$/),
  ).toBeVisible();

  // Refresh re-reads the snapshot. The journey passes through the console
  // home, whose queue cards also read it — assert the refresh delta, not an
  // absolute count.
  const before = calls;
  // exact: the executions section has its own "Refresh executions" button.
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => calls).toBe(before + 1);
  await expect(queueList.getByText("transcode_jobs")).toBeVisible();
});

test("an admin can filter executions and inspect sanitized detail history", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(JOBS, (route) => route.fulfill({ json: jobs }));
  await page.route(JOB_EVENTS, (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: ": heartbeat\n\n",
    }),
  );
  let filteredUrl = "";
  await page.route(JOB_RUNS, (route) => {
    const url = route.request().url();
    if (url.includes("failure=true")) filteredUrl = url;
    return route.fulfill({ json: runsResponse });
  });
  await page.route(JOB_DETAIL, (route) => route.fulfill({ json: detailResponse }));
  await openJobs(page);

  await page.getByLabel("State").selectOption("failed");
  // exact: "Resource type" also label-matches a substring "Type".
  await page.getByLabel("Type", { exact: true }).fill("video_import");
  await page.getByLabel("Resource type").fill("video");
  await page.getByLabel("Resource ID").fill("video-bbbb");
  await page.getByLabel("Worker").fill("worker-a");
  // exact: the "Recent failures" region's aria-label also label-matches "Failure".
  await page.getByLabel("Failure", { exact: true }).selectOption("true");
  await page.getByLabel("Created after").fill("2026-07-01T00:00");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect.poll(() => filteredUrl).toContain("state=failed");
  expect(filteredUrl).toContain("type=video_import");
  expect(filteredUrl).toContain("resource_type=video");
  expect(filteredUrl).toContain("resource_id=video-bbbb");
  expect(filteredUrl).toContain("worker_id=worker-a");
  expect(filteredUrl).toContain("failure=true");
  expect(filteredUrl).toContain("created_after=");

  const failedRow = page.getByRole("row").filter({ hasText: "video_import" }).first();
  await failedRow.getByRole("button", { name: "View details" }).click();
  await expect(page.getByText("Sanitized failure")).toBeVisible();
  await expect(page.getByText("Upstream connection was refused (credentials redacted).")).toBeVisible();
  await expect(page.getByText("Sanitized input metadata")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution events" })).toBeVisible();
  await expect(page.getByText("Import attempt failed safely.")).toBeVisible();
  await page.getByText("Event metadata").click();
  await expect(page.getByText(/reason_code/)).toBeVisible();
});

test("SSE job events trigger a debounced REST refresh", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(JOBS, (route) => route.fulfill({ json: jobs }));
  let runCalls = 0;
  await page.route(JOB_RUNS, (route) => {
    runCalls += 1;
    const run = runCalls === 1 ? runA : { ...runA, state: "succeeded", stage: "finished", progress_percent: 100 };
    return route.fulfill({ json: { ...runsResponse, runs: [run], total: 1 } });
  });
  let streamCalls = 0;
  await page.route(JOB_EVENTS, (route) => {
    streamCalls += 1;
    const body =
      streamCalls === 1
        ? `id: 90071992547409930002\nevent: job-event\ndata: ${JSON.stringify({
            id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            cursor: "90071992547409930002",
            job_id: runA.id,
            kind: "succeeded",
            state: "succeeded",
            attempt: 1,
            metadata: {},
            occurred_at: "2026-07-03T10:01:00Z",
          })}\n\n`
        : ": heartbeat\n\n";
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body,
    });
  });
  await openJobs(page);

  await expect.poll(() => runCalls).toBeGreaterThanOrEqual(2);
  const executions = page.getByRole("table", { name: "Job executions" });
  await expect(executions.getByText("succeeded", { exact: true })).toBeVisible();
});
