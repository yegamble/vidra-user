import { expect, test, type Page } from "@playwright/test";

// Mocked admin infrastructure coverage (a real backend is not running in
// `npm run ci`). Covers the admin gate, the four deploy-shape panels, the
// feature-discovery list's three states, and the outbound-mail probe's success
// and failure paths.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const INFRA = /\/api\/v1\/admin\/infrastructure$/;
const MAIL_TEST = /\/api\/v1\/admin\/mail\/test$/;

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

const infrastructure = {
  server: {
    environment: "production",
    request_timeout_seconds: 30,
    stream_request_timeout_seconds: 900,
    body_limit: "8M",
    upload_max_bytes: 2147483648,
    metrics_enabled: true,
    tracing_enabled: false,
    tracing_protocol: "grpc",
  },
  storage: {
    backend: "s3",
    local_root: "",
    s3_endpoint: "s3.example.test:443",
    s3_bucket: "vidra-media",
    s3_region: "us-east-1",
    s3_use_ssl: true,
    s3_force_path_style: false,
  },
  networking: {
    public_base_url: "https://vidra.example.test",
    https_effective: true,
    allow_plain_http: false,
    trusted_proxy_cidrs: [],
    cors_allowed_origins: ["https://vidra.example.test"],
    federation_enabled: true,
    atproto_enabled: false,
    atproto_login_enabled: false,
  },
  backups: {
    external_postgres: false,
    schedule_note: "A database dump is written every day at 03:00 UTC.",
    staleness_note:
      "An artifact older than 26 hours means the schedule stopped running.",
    artifacts_note:
      "Two families are kept: database dumps and object-storage manifests.",
    live_state_note:
      "Run `vidra doctor` on the host to see whether the contract is being met.",
  },
  features: [
    // On and complete: no note at all.
    { key: "object_storage", enabled: true, configured: true },
    // On but half-wired: the finding this page exists to surface.
    {
      key: "mail",
      enabled: true,
      configured: false,
      note: "Mail is enabled but no SMTP relay is configured, so nothing can be delivered.",
    },
    // Off: discovery copy, because an operator cannot switch on what they
    // never knew shipped.
    {
      key: "search",
      enabled: false,
      configured: false,
      note: "A search service indexes titles and descriptions for fast lookup.",
    },
    { key: "federation", enabled: true, configured: true },
    {
      key: "atproto",
      enabled: false,
      configured: false,
      note: "Cross-post new videos to Bluesky automatically.",
    },
    {
      key: "tracing",
      enabled: false,
      configured: false,
      note: "Export request traces to an OpenTelemetry collector.",
    },
  ],
};

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({
      json: { videos: [], sort: "recent", limit: 20, offset: 0 },
    }),
  );
  await page.route(UNREAD, (route) =>
    route.fulfill({ json: { unread_count: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
}

async function openInfrastructure(page: Page) {
  await page.route(USERS, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Infrastructure" }).click();
  await expect(page).toHaveURL(/\/admin\/infrastructure$/);
}

test("anonymous viewers are gated out of infrastructure", async ({ page }) => {
  let fetched = false;
  await page.route(INFRA, (route) => {
    fetched = true;
    return route.fulfill({ json: infrastructure });
  });
  await page.goto("/admin/infrastructure");
  await expect(page.getByText("Administrators only")).toBeVisible();
  // The gate is not cosmetic: no admin request is made at all.
  expect(fetched).toBe(false);
});

test("an admin sees the deploy shape across all four panels", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(INFRA, (route) => route.fulfill({ json: infrastructure }));
  await openInfrastructure(page);

  // Server.
  await expect(page.getByText("8M")).toBeVisible();
  await expect(page.getByText("2.0 GB")).toBeVisible();

  // Storage — the bucket's coordinates are operational; no credential appears.
  await expect(page.getByText("Object storage (S3)")).toBeVisible();
  await expect(page.getByText("vidra-media")).toBeVisible();
  await expect(page.getByText("s3.example.test:443")).toBeVisible();

  // Networking.
  await expect(
    page.getByText("https://vidra.example.test").first(),
  ).toBeVisible();
  await expect(page.getByText("HTTPS", { exact: true })).toBeVisible();

  // Backups report the contract and name the tool that knows the live answer.
  await expect(page.getByText(/every day at 03:00 UTC/)).toBeVisible();
  await expect(page.getByText(/vidra doctor/)).toBeVisible();
});

test("the feature list separates off, half-wired, and complete", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(INFRA, (route) => route.fulfill({ json: infrastructure }));
  await openInfrastructure(page);

  const features = page.getByRole("region", { name: "Optional features" });

  // On + complete: an Active pill and no advice to give.
  const storage = features
    .getByRole("listitem")
    .filter({ hasText: "Object storage" });
  await expect(storage.getByText("Active")).toBeVisible();

  // On but unconfigured: a warning, NOT a green pill that lies about it.
  const mail = features
    .getByRole("listitem")
    .filter({ hasText: "Outbound mail" });
  await expect(mail.getByText("Needs setup")).toBeVisible();
  await expect(mail.getByText(/no SMTP relay is configured/)).toBeVisible();

  // Off: discovery copy, prefixed "Optional", with a link where a runtime
  // setting actually exists.
  const search = features
    .getByRole("listitem")
    .filter({ hasText: "Search service" });
  await expect(search.getByText("Off")).toBeVisible();
  await expect(
    search.getByText(/Optional: A search service indexes/),
  ).toBeVisible();
  await expect(
    search.getByRole("link", { name: "Open settings" }),
  ).toHaveAttribute("href", "/admin/config/advanced");

  // Boot-env-only features get NO link: sending an operator to a page without
  // the promised switch is worse than sending them nowhere.
  const tracing = features
    .getByRole("listitem")
    .filter({ hasText: "Distributed tracing" });
  await expect(tracing.getByText("Off")).toBeVisible();
  await expect(
    tracing.getByRole("link", { name: "Open settings" }),
  ).toHaveCount(0);
});

test("the mail probe reports acceptance without printing the address", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(INFRA, (route) => route.fulfill({ json: infrastructure }));
  let body: string | null = "unset";
  await page.route(MAIL_TEST, (route) => {
    body = route.request().postData();
    return route.fulfill({ status: 202, json: { status: "sent" } });
  });
  await openInfrastructure(page);

  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(page.getByText("Handed to the relay")).toBeVisible();
  // 202 is a promise to try, and the copy says so rather than claiming delivery.
  await expect(page.getByText(/not proof of delivery/)).toBeVisible();
  // No recipient travels: the server picks it, so the button cannot be a relay.
  expect(body).toBeNull();
  // And the address itself is never rendered.
  await expect(page.getByText(/@/)).toHaveCount(0);
});

test("mail probe failures explain what to do next", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(INFRA, (route) => route.fulfill({ json: infrastructure }));

  // 503: this deployment has no outbound mail path at all.
  await page.route(MAIL_TEST, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "mail_not_configured",
          message: "mail is not configured",
        },
      },
    }),
  );
  await openInfrastructure(page);
  // Next mounts its own role=alert route announcer, so scope to the probe.
  const alert = page
    .getByRole("region", { name: "Outbound mail test" })
    .getByRole("alert");

  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(alert).toContainText(/no outbound mail configured/);

  // 409: mail works, but there is no contact address to send to. The copy names
  // the setting so the operator knows exactly which field to fill.
  await page.unroute(MAIL_TEST);
  await page.route(MAIL_TEST, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "conflict", message: "no contact email" } },
    }),
  );
  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(alert).toContainText(/contact_email/);

  // 502: the relay refused. The relay's own answer routinely quotes the
  // recipient address, so it stays in the server log and never reaches here.
  await page.unroute(MAIL_TEST);
  await page.route(MAIL_TEST, (route) =>
    route.fulfill({
      status: 502,
      json: { error: { code: "mail_test_failed", message: "relay refused" } },
    }),
  );
  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(alert).toContainText(/server log/);

  // A failed probe never claims success.
  await expect(page.getByText("Handed to the relay")).toHaveCount(0);
});
