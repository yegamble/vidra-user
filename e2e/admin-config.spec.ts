import { expect, test, type Page } from "@playwright/test";

// Mocked admin instance-configuration coverage (a real backend is not running in
// `npm run ci`; PATCH persistence against the real stack is proven in
// e2e-backed/instance-settings.spec.ts). Covers the config-parity W2 IA:
// /admin/config as a layout route with a persistent left rail of pages
// (general | vod | live | federation | customization | homepage | ipfs | advanced),
// per-page grouped sections, progressive disclosure, server-backed dry-run
// field validation (the client keeps no copy of the backend's rules), the
// per-section save, the badge-only-when-overridden rule with the config
// default displayed, and the metadata-driven auto-render invariant (unknown
// keys are never hidden; server page/section placement wins).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const SETTINGS = /\/api\/v1\/admin\/instance-settings$/;
const VALIDATE = /\/api\/v1\/admin\/instance-settings\/validate$/;
const DOCS =
  /\/api\/v1\/admin\/instance-documents\/(homepage|custom_css|custom_js)$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const INSTANCE = /\/api\/v1\/instance$/;
const IPFS_STATUS = /\/api\/v1\/ipfs\/status$/;
const IPFS_RECONCILE = /\/api\/v1\/admin\/ipfs\/reconcile/;

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

const videoConfig = {
  categories: [
    { id: "7", label: "Comedy" },
    { id: "9", label: "Science & Technology" },
  ],
  languages: [
    { id: "en", label: "English" },
    { id: "fr", label: "French" },
  ],
  licenses: [{ id: "1", label: "Attribution" }],
};

const instanceDoc = {
  name: "Vidra",
  federation_enabled: true,
  registration_enabled: true,
  features: { uploads: true, imports: true, live: false, comments: true },
};

function str(key: string, value = "", overridden = false) {
  return { key, type: "string", value, default: "", overridden };
}
function bool(key: string, value = false, overridden = false) {
  return { key, type: "bool", value, default: false, overridden };
}

// The FULL post-backend key set, including the new enum/list kinds.
const settings = {
  settings: [
    str("contact_email"),
    bool("contact_form_enabled"),
    {
      key: "instance_name",
      type: "string",
      value: "Vidra",
      default: "Vidra",
      overridden: false,
    },
    str("instance_short_description"),
    str("instance_description"),
    {
      key: "default_language",
      type: "string",
      value: "en",
      default: "en",
      overridden: false,
    },
    {
      key: "instance_categories",
      type: "list",
      value: [],
      default: [],
      overridden: false,
    },
    {
      key: "moderator_languages",
      type: "list",
      value: ["en"],
      default: [],
      overridden: true,
    },
    str("server_country"),
    str("terms_url", "https://terms.example", true),
    str("privacy_url"),
    bool("broadcast_enabled"),
    str("broadcast_message"),
    {
      key: "broadcast_level",
      type: "enum",
      value: "info",
      default: "info",
      overridden: false,
      options: ["info", "warning", "error"],
    },
    bool("broadcast_dismissable"),
    str("support_text"),
    str("website_link"),
    str("mastodon_link"),
    str("x_link"),
    str("bluesky_link"),
    bool("instance_is_sensitive"),
    {
      key: "sensitive_content_policy",
      type: "enum",
      value: "hide",
      default: "hide",
      overridden: false,
      options: ["hide", "warn", "blur", "display"],
    },
    str("terms"),
    str("code_of_conduct"),
    str("moderation_info"),
    bool("quarantine_new_uploads"),
    str("administrator_info"),
    str("creation_reason"),
    str("maintenance_lifetime"),
    str("business_model"),
    str("hardware_info"),
    bool("registration_enabled", true),
    bool("registration_require_approval"),
    bool("uploads_enabled", true),
    bool("imports_enabled", true),
    {
      key: "import_max_height",
      type: "int",
      value: 1080,
      default: 1080,
      overridden: false,
    },
    bool("live_enabled"),
    bool("comments_enabled", true),
  ],
};

// The /instance mock is registered BEFORE the first page load: the client
// caches the instance document per load (getInstanceCached), so a per-test
// override must be in place from the start.
async function signIn(page: Page, role: Role, instance: object = instanceDoc) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({
      json: { videos: [], sort: "recent", limit: 20, offset: 0 },
    }),
  );
  await page.route(UNREAD, (route) =>
    route.fulfill({ json: { unread_count: 0 } }),
  );
  await page.route(INSTANCE, (route) => route.fulfill({ json: instance }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
}

// Sign in as admin, then client-side navigate to the config page (keeps the
// in-memory session, unlike a hard goto). Lands on /admin/config, which
// redirects to the IA's first page: /admin/config/general.
async function openConfig(page: Page) {
  await page.route(USERS, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: videoConfig }),
  );
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  // The desktop console (DR12) labels this destination "Instance".
  await page
    .getByRole("navigation", { name: "Admin console" })
    .getByRole("link", { name: "Instance" })
    .click();
  await expect(page).toHaveURL(/\/admin\/config\/general$/);
}

// The persistent left rail of config pages.
function configNav(page: Page) {
  return page.getByRole("navigation", { name: "Configuration pages" });
}

test("anonymous viewers are gated out of instance configuration", async ({
  page,
}) => {
  let fetched = false;
  await page.route(SETTINGS, (route) => {
    fetched = true;
    return route.fulfill({ json: settings });
  });
  await page.goto("/admin/config");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular user gets no admin entry and is gated from config", async ({
  page,
}) => {
  await signIn(page, "user");
  // No Admin entry point in the header for a non-admin.
  await expect(
    page.getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);

  let fetched = false;
  await page.route(SETTINGS, (route) => {
    fetched = true;
    return route.fulfill({ json: settings });
  });
  await page.goto("/admin/config/general");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("/admin/config redirects to the general page and shows the page rail", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);

  // The eight-page rail, in IA order.
  const nav = configNav(page);
  for (const label of [
    "General",
    "VOD",
    "Live",
    "Federation",
    "Customization",
    "Homepage",
    "IPFS",
    "Advanced",
  ]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "General" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the IPFS page shows both swarms and runs a scoped reconciliation", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await page.route(IPFS_STATUS, (route) =>
    route.fulfill({
      json: {
        enabled: true,
        node_reachable: true,
        gateway_url: "https://ipfs.example.test",
        cluster_enabled: false,
        cluster_reachable: false,
        pins: { pinned: 7, pending: 1, failed: 0, unpinned: 2 },
        by_class: [],
        networks: {
          public: {
            enabled: true,
            node_reachable: true,
            cluster_enabled: false,
            cluster_reachable: false,
            pins: { pinned: 5, pending: 1, failed: 0, unpinned: 1 },
            by_class: [
              {
                media_class: "thumbnail",
                pinned: 5,
                pending: 1,
                failed: 0,
                unpinned: 1,
              },
            ],
          },
          private: {
            enabled: true,
            node_reachable: true,
            cluster_enabled: false,
            cluster_reachable: false,
            pins: { pinned: 2, pending: 0, failed: 0, unpinned: 1 },
            by_class: [],
          },
        },
      },
    }),
  );
  let reconcileURL = "";
  await page.route(IPFS_RECONCILE, (route) => {
    reconcileURL = route.request().url();
    return route.fulfill({
      status: 202,
      json: { enqueued: 2, by_class: { thumbnail: 2 } },
    });
  });

  await openConfig(page);
  await configNav(page).getByRole("link", { name: "IPFS" }).click();
  await expect(page).toHaveURL(/\/admin\/config\/ipfs$/);
  await expect(
    page.getByRole("heading", { name: "Public distribution" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Private replication" }),
  ).toBeVisible();
  await expect(page.getByText("https://ipfs.example.test")).toBeVisible();

  await page.getByRole("button", { name: "Reconcile public" }).click();
  await expect(
    page.getByText(/Reconciliation accepted for public IPFS/),
  ).toBeVisible();
  expect(new URL(reconcileURL).searchParams.get("network")).toBe("public");
});

test("the general page renders its sections with badge-only-when-overridden", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);

  // The general page's section structure mirrors the server section ids
  // (uploads/limits and the comments toggle moved to VOD; the legal/terms/
  // support/hardware markdown consolidated into the server's About page section).
  for (const title of [
    "Platform",
    "Administrators & contact",
    "Broadcast message",
    "Social",
    "Moderation & sensitive content",
    "About page",
    "Sign-up & new users",
  ]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  // The in-page anchor rail mirrors those sections (desktop).
  await expect(
    page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: "Platform", exact: true }),
  ).toBeVisible();

  // Spec labels render with effective values.
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Vidra");
  await expect(page.getByLabel("Admin email")).toBeVisible();
  await expect(page.getByLabel("Short description")).toBeVisible();
  await expect(page.getByLabel("Default language")).toHaveValue("en");
  await expect(page.getByLabel("Server country")).toBeVisible();
  await expect(page.getByLabel("Bluesky link")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Who is behind the instance?" }),
  ).toHaveCount(0); // the four questions are field labels, not headings
  await expect(page.getByText("Who is behind the instance?")).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: "This instance is dedicated to sensitive content",
    }),
  ).toBeVisible();

  // VOD/Live keys do NOT render here — they moved to their own pages.
  await expect(page.getByRole("switch", { name: "Video uploads" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("switch", { name: "Live streaming" }),
  ).toHaveCount(0);

  // The sensitive policy renders as a segmented control at its effective value.
  const policy = page.getByRole("group", {
    name: "Policy on videos containing sensitive content",
  });
  await expect(policy.getByRole("button", { name: "Hide" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(policy.getByRole("button", { name: "Display" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // The list kind renders as a checkbox multi-select with taxonomy labels.
  const langs = page.getByRole("group", {
    name: "Main languages you/your moderators speak",
  });
  await expect(langs.getByRole("checkbox", { name: "English" })).toBeChecked();
  await expect(
    langs.getByRole("checkbox", { name: "French" }),
  ).not.toBeChecked();

  // Badge rule: ONLY overridden keys carry a badge (+ the config default and
  // the reset affordance); a key at its config default shows NO badge at all.
  await expect(page.getByText("Overridden")).toHaveCount(2); // terms_url + moderator_languages
  await expect(
    page.getByRole("button", { name: "Reset to default" }),
  ).toHaveCount(2);
  await expect(page.getByText("Default: empty")).toHaveCount(1); // terms_url's config default
  await expect(page.getByText("Default: none")).toHaveCount(1); // moderator_languages'

  // Save is disabled until something changes.
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
});

test("the left rail walks the IA: VOD, Live, Federation, empty pages, Advanced", async ({
  page,
}) => {
  // Federation disabled at boot for this walk — the page explains itself.
  await signIn(page, "admin", { ...instanceDoc, federation_enabled: false });
  await page.route(SETTINGS, (route) =>
    route.fulfill({
      json: {
        settings: [
          ...settings.settings,
          // The auto-render invariant: an unknown key with server placement
          // lands in the named page/section; one without lands in Advanced.
          {
            key: "clamav_enabled",
            type: "bool",
            value: true,
            default: true,
            overridden: false,
            page: "vod",
            section: "transcoding",
          },
          {
            key: "mystery_knob",
            type: "bool",
            value: false,
            default: false,
            overridden: false,
          },
        ],
      },
    }),
  );
  await openConfig(page);
  const nav = configNav(page);

  // VOD: uploads/imports sections carry the toggles and limits that left General.
  await nav.getByRole("link", { name: "VOD" }).click();
  await expect(
    page.getByRole("heading", { name: "Uploads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Imports", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Video uploads" }),
  ).toBeVisible();
  await expect(page.getByLabel("Import resolution cap")).toHaveValue("1080");
  // Server-placed unknown key: under the Transcoding section, fully editable.
  await expect(
    page.getByRole("heading", { name: "Transcoding", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "clamav_enabled" }),
  ).toBeVisible();

  // Live: its master toggle lives here now.
  await nav.getByRole("link", { name: "Live" }).click();
  await expect(
    page.getByRole("switch", { name: "Live streaming" }),
  ).toBeVisible();

  // Federation: the W12 inbox gates render (disabled here — this mock returns no
  // federation rows) carrying an ActivityPub protocol badge, plus a page-wide
  // boot-dependency explanation while federation is off at boot.
  await nav.getByRole("link", { name: "Federation" }).click();
  await expect(page.getByText(/FEDERATION_ENABLED/)).toBeVisible();
  await expect(page.getByText("Accept remote comments")).toBeVisible();
  await expect(page.getByText("ActivityPub").first()).toBeVisible();

  // Customization: the hide-name toggle's home (W4) — rendered disabled while
  // this mocked backend does not return the key, never hidden.
  await nav.getByRole("link", { name: "Customization" }).click();
  await expect(
    page.getByRole("heading", { name: "Header", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Hide the instance name in the header" }),
  ).toBeDisabled();
  // Homepage: the W6 document editor panel (not a registry key).
  await page.route(DOCS, (route) =>
    route.fulfill({
      json: {
        name: route.request().url().split("/").pop(),
        body: "",
        hash: "",
      },
    }),
  );
  await nav.getByRole("link", { name: "Homepage" }).click();
  await expect(
    page.getByRole("heading", { name: "Homepage document" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Homepage content editor" }),
  ).toBeVisible();

  // Advanced: the W6 custom CSS/JS editors + the unplaced unknown key
  // auto-rendering under "Other settings".
  await nav.getByRole("link", { name: "Advanced" }).click();
  await expect(
    page.getByRole("heading", { name: "Custom CSS", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Custom JavaScript", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Other settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "mystery_knob" }),
  ).toBeVisible();
});

test("an admin edits settings and saves a partial patch (with progressive disclosure)", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Vidra");
  const registration = page.getByRole("switch", {
    name: "Allow new registrations",
  });
  await expect(registration).toHaveAttribute("aria-checked", "true");
  // Its child renders while the parent is on…
  await expect(
    page.getByRole("switch", { name: "Require approval for new accounts" }),
  ).toBeVisible();

  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  // Edit two keys: rename the instance and close registration.
  await page.getByLabel("Name", { exact: true }).fill("My Vidra");
  await registration.click();
  await expect(registration).toHaveAttribute("aria-checked", "false");
  // …and hides once the parent toggle goes off (progressive disclosure).
  await expect(
    page.getByRole("switch", { name: "Require approval for new accounts" }),
  ).toHaveCount(0);
  await expect(page.getByText("2 unsaved changes")).toBeVisible();

  // The PATCH carries only the changed keys; the response is the new effective doc.
  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) => {
        if (s.key === "instance_name")
          return { ...s, value: "My Vidra", overridden: true };
        if (s.key === "registration_enabled")
          return { ...s, value: false, overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });

  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({
    instance_name: "My Vidra",
    registration_enabled: false,
  });

  // The saved values are reflected back (no longer dirty).
  await expect(save).toBeDisabled();
  await expect(registration).toHaveAttribute("aria-checked", "false");
});

test("per-section save patches only that section's changed keys", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  // Dirty two sections: Administrators & contact (contact_email) and Platform (name).
  await page.getByLabel("Admin email").fill("root@example.test");
  await page.getByLabel("Name", { exact: true }).fill("My Vidra");
  await expect(page.getByText("2 unsaved changes")).toBeVisible();

  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) =>
        s.key === "contact_email"
          ? { ...s, value: "root@example.test", overridden: true }
          : s,
      ),
    };
    return route.fulfill({ json: updated });
  });

  await page
    .getByRole("button", { name: "Save Administrators & contact" })
    .click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({ contact_email: "root@example.test" });

  // The Platform edit survives as the one remaining pending change.
  await expect(page.getByText("1 unsaved change")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "My Vidra",
  );
});

test("the dry run flags an out-of-range limit on blur and blocks saving", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  // The message the row shows is the SERVER's, verbatim — the client keeps no
  // copy of the rule, so the mock IS the source of the copy under test.
  const asked: unknown[] = [];
  await page.route(VALIDATE, async (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        fields: [
          {
            field: "import_max_height",
            message: "must be 0 or between 144 and 4320",
          },
        ],
      },
    });
  });
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "VOD" }).click();

  const height = page.getByLabel("Import resolution cap");
  await expect(height).toHaveValue("1080");
  await height.fill("100");
  // Leaving the field is what triggers the question.
  await height.blur();

  await expect(
    page.getByText("must be 0 or between 144 and 4320"),
  ).toBeVisible();
  await expect(
    page.getByText("Fix the highlighted fields to save."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  // One key per probe: this row's question, not the whole draft's.
  expect(asked).toEqual([{ import_max_height: 100 }]);

  // Editing clears the stale verdict at once and re-enables saving.
  await height.fill("720");
  await expect(page.getByText("must be 0 or between 144 and 4320")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeEnabled();
});

test("an unreachable dry run never blocks a save — the 422 is the backstop", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: settings });
    return route.fulfill({ json: settings });
  });
  await page.route(VALIDATE, (route) => route.abort());
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "VOD" }).click();

  const height = page.getByLabel("Import resolution cap");
  await height.fill("100");
  await height.blur();

  // No invented error, no disabled button: the write re-validates anyway, and
  // guessing here would block a save the server might have accepted.
  await expect(
    page.getByText("Fix the highlighted fields to save."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeEnabled();
});

test("segmented policy + multi-select changes patch as enum string and JSON array", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  // Pick "Blur" on the segmented control.
  const policy = page.getByRole("group", {
    name: "Policy on videos containing sensitive content",
  });
  await policy.getByRole("button", { name: "Blur" }).click();
  await expect(policy.getByRole("button", { name: "Blur" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Tick a category in the multi-select list.
  const categories = page.getByRole("group", {
    name: "Main instance categories",
  });
  await categories.getByRole("checkbox", { name: "Comedy" }).check();

  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) => {
        if (s.key === "sensitive_content_policy")
          return { ...s, value: "blur", overridden: true };
        if (s.key === "instance_categories")
          return { ...s, value: ["7"], overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  // Enum travels as a JSON string, the list as a JSON array.
  expect(patchBody).toEqual({
    sensitive_content_policy: "blur",
    instance_categories: ["7"],
  });
});

test("W5 browse/landing/player defaults: enum pickers on their pages, one patch per page", async ({
  page,
}) => {
  // The shared payload plus the six W5 keys. The real backend ALWAYS
  // serializes page/section (vidra-core admin_instance_settings.go), and
  // server placement wins over the client META fallback — so the fixture
  // carries the registry's placement (general/browse ×4, customization/theme,
  // customization/player) to exercise the server-placement path a live
  // instance takes; a registry/META divergence would fail here instead of
  // being masked by the fallback (the W4 branding lesson, commit 945f887).
  // Kept local so the other tests' section expectations stay untouched.
  const enumRow = (
    key: string,
    value: string,
    options: string[],
    page: string,
    section: string,
  ) => ({
    key,
    type: "enum",
    value,
    default: value,
    overridden: false,
    options,
    page,
    section,
  });
  const w5Settings = {
    settings: [
      ...settings.settings,
      enumRow(
        "default_landing_page",
        "home-recent",
        ["home-recent", "trending", "local", "home"],
        "general",
        "browse",
      ),
      enumRow(
        "default_feed_sort",
        "recent",
        ["recent", "popular", "trending"],
        "general",
        "browse",
      ),
      enumRow(
        "default_feed_scope",
        "local",
        ["local", "all"],
        "general",
        "browse",
      ),
      {
        ...bool("miniature_prefer_author_display_name"),
        page: "general",
        section: "browse",
      },
      enumRow(
        "default_theme",
        "system",
        ["system", "light", "dark"],
        "customization",
        "theme",
      ),
      {
        ...bool("default_player_autoplay", true),
        page: "customization",
        section: "player",
      },
    ],
  };
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: w5Settings });
    return route.fallback();
  });
  await openConfig(page);

  // General → Landing & browse defaults: segmented enum pickers + the flag.
  await expect(
    page.getByRole("heading", { name: "Landing & browse defaults" }),
  ).toBeVisible();
  const landing = page.getByRole("group", { name: "Landing page" });
  await expect(
    landing.getByRole("button", { name: "Default feed" }),
  ).toHaveAttribute("aria-pressed", "true");
  await landing.getByRole("button", { name: "Trending" }).click();
  const feedSort = page.getByRole("group", { name: "Default feed sort" });
  await feedSort.getByRole("button", { name: "Popular" }).click();

  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: w5Settings.settings.map((s) => {
        if (s.key === "default_landing_page")
          return { ...s, value: "trending", overridden: true };
        if (s.key === "default_feed_sort")
          return { ...s, value: "popular", overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });
  await page
    .getByRole("button", { name: "Save Landing & browse defaults" })
    .click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({
    default_landing_page: "trending",
    default_feed_sort: "popular",
  });

  // Customization → the theme picker (Theme section) and the player toggle
  // (its own Player section) render there, matching the backend registry.
  await configNav(page).getByRole("link", { name: "Customization" }).click();
  await expect(page).toHaveURL(/\/admin\/config\/customization$/);
  const theme = page.getByRole("group", { name: "Default theme" });
  await expect(theme.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Player" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Autoplay" })).toBeChecked();
});

test("broadcast: progressive disclosure, markdown preview, level picker, one patch", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  // Message/level/dismissable stay hidden while the master toggle is off.
  const master = page.getByRole("switch", {
    name: "Display a message on every page",
  });
  await expect(master).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Style" })).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Viewers can dismiss the message" }),
  ).toHaveCount(0);

  // Progressive disclosure: turning it on reveals the children.
  await master.click();
  const message = page.getByLabel("Message", { exact: true });
  await expect(message).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Viewers can dismiss the message" }),
  ).toBeVisible();

  // The message is a markdown textarea with the shared preview affordance.
  await message.fill("Maintenance **tonight** at 22:00 UTC.");
  await page
    .getByRole("button", { name: "Preview Message", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("tonight")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The level renders as a segmented picker at its effective value.
  const style = page.getByRole("group", { name: "Style" });
  await expect(style.getByRole("button", { name: "Info" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await style.getByRole("button", { name: "Warning" }).click();

  // The whole slice travels as one PATCH: bool + markdown string + level enum.
  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) => {
        if (s.key === "broadcast_enabled")
          return { ...s, value: true, overridden: true };
        if (s.key === "broadcast_message")
          return {
            ...s,
            value: "Maintenance **tonight** at 22:00 UTC.",
            overridden: true,
          };
        if (s.key === "broadcast_level")
          return { ...s, value: "warning", overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });
  await page.getByRole("button", { name: "Save Broadcast message" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({
    broadcast_enabled: true,
    broadcast_message: "Maintenance **tonight** at 22:00 UTC.",
    broadcast_level: "warning",
  });
});

test("branding: six asset slots, inline type validation, upload, and confirmed remove", async ({
  page,
}) => {
  // A W1+ backend: /instance carries the branding block (everything fallback).
  const unset = { url: "", is_fallback: true };
  const emptyBranding = {
    avatar: unset,
    banner: unset,
    logos: {
      favicon: unset,
      header_wide: unset,
      header_square: unset,
      opengraph: unset,
    },
    hide_instance_name: false,
  };
  const brandedInstance = { ...instanceDoc, branding: emptyBranding };
  await signIn(page, "admin", brandedInstance);
  await page.route(SETTINGS, (route) =>
    route.fulfill({
      json: {
        settings: [
          ...settings.settings,
          // The REAL backend's W1 placement metadata for the W4 keys
          // (vidra-core instancesettings registry): the hide-name toggle is
          // server-placed at customization/header, NOT in general/branding —
          // the panel must render on General regardless.
          {
            ...bool("header_hide_instance_name"),
            page: "customization",
            section: "header",
          },
          {
            ...str("social_meta_twitter_username"),
            page: "general",
            section: "social",
          },
        ],
      },
    }),
  );
  await openConfig(page);

  // The Branding section hosts the assets panel even though no registry key
  // lands in it; the social handle renders under Social.
  await expect(
    page.getByRole("heading", { name: "Branding", exact: true }),
  ).toBeVisible();
  const panel = page.getByRole("group", { name: "Branding assets" });
  for (const label of [
    "Avatar image",
    "Banner image",
    "Favicon image",
    "Header logo (wide) image",
    "Header logo (square) image",
    "Social card image image",
  ]) {
    await expect(panel.getByLabel(label)).toBeVisible();
  }
  // Nothing set: every slot honestly reports the built-in default, none removable.
  await expect(panel.getByText("Using the built-in default.")).toHaveCount(6);
  await expect(panel.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  // The server homes the hide-name toggle on the Customization page, so it
  // does NOT render here (asserted there at the end of this test)…
  await expect(
    page.getByRole("switch", { name: "Hide the instance name in the header" }),
  ).toHaveCount(0);
  // …while the server-placed social handle renders under Social.
  await expect(
    page.getByLabel("X (Twitter) username for link cards"),
  ).toBeVisible();

  // Inline validation mirrors the backend type gate: a GIF never leaves the browser.
  let uploadRequests = 0;
  await page.route(
    /\/api\/v1\/admin\/instance-(avatar|banner|logo\/[a-z-]+)$/,
    (route) => {
      uploadRequests += 1;
      return route.fulfill({ status: 201, json: {} });
    },
  );
  await panel.getByLabel("Banner image").setInputFiles({
    name: "anim.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("gif"),
  });
  await expect(
    page.getByText("The image must be a JPEG, PNG, or WebP."),
  ).toBeVisible();
  expect(uploadRequests).toBe(0);

  // A valid pick POSTs multipart to the W1 endpoint and the panel re-reads
  // /instance for the fresh URL + is_fallback state.
  await page.route(INSTANCE, (route) =>
    route.fulfill({
      json: {
        ...brandedInstance,
        branding: {
          ...emptyBranding,
          avatar: { url: "/api/v1/instance/avatar", is_fallback: false },
        },
      },
    }),
  );
  await panel.getByLabel("Avatar image").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from("png"),
  });
  await expect(panel.getByAltText("Current avatar")).toBeVisible();
  expect(uploadRequests).toBe(1);

  // Remove asks for an inline confirmation before the DELETE; afterwards the
  // slot falls back to the built-in default.
  let deleted = false;
  await page.route(/\/api\/v1\/admin\/instance-avatar$/, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deleted = true;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route(INSTANCE, (route) =>
    route.fulfill({ json: brandedInstance }),
  );
  await panel.getByRole("button", { name: "Remove avatar" }).click();
  await expect(panel.getByText("Remove this image?")).toBeVisible();
  expect(deleted).toBe(false);
  await panel.getByRole("button", { name: "Confirm removing avatar" }).click();
  await expect(panel.getByAltText("Current avatar")).toHaveCount(0);
  await expect(panel.getByText("Using the built-in default.")).toHaveCount(6);
  expect(deleted).toBe(true);

  // The server-placed hide-name toggle lives on Customization, under the
  // pre-declared Header section — present, enabled, and editable.
  await configNav(page).getByRole("link", { name: "Customization" }).click();
  await expect(
    page.getByRole("heading", { name: "Header", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Hide the instance name in the header" }),
  ).toBeEnabled();
});

test("the markdown Preview button opens the shared rendered-preview modal", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);

  await page
    .getByLabel("Description", { exact: true })
    .fill("## Welcome\n\nBe **excellent** to each other.");
  await page
    .getByRole("button", { name: "Preview Description", exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The markdown renders as elements, not raw text.
  await expect(dialog.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(dialog.getByText("excellent")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("W6 homepage document editor: load, preview, size counter, save, clear", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  let putBody: unknown = null;
  await page.route(DOCS, (route) => {
    if (route.request().method() === "PUT") {
      putBody = route.request().postDataJSON();
      const body = (putBody as { body: string }).body;
      return route.fulfill({
        json: { name: "homepage", body, hash: body === "" ? "" : "beef1234" },
      });
    }
    return route.fulfill({
      json: { name: "homepage", body: "# Old welcome", hash: "aa11" },
    });
  });
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "Homepage" }).click();

  // The stored document loads into the editor with its live byte counter.
  const editor = page.getByRole("group", { name: "Homepage content editor" });
  const field = editor.getByLabel("Homepage content", { exact: true });
  await expect(field).toHaveValue("# Old welcome");
  await expect(editor.getByText("0 KB of 100 KB")).toBeVisible();
  const save = editor.getByRole("button", { name: "Save homepage content" });
  await expect(save).toBeDisabled(); // nothing changed yet

  // Edit → dirty state; the shared preview modal renders the markdown.
  await field.fill("# Welcome to **Vidra**");
  await expect(editor.getByText("Unsaved changes")).toBeVisible();
  await editor
    .getByRole("button", { name: "Preview Homepage content" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Welcome to Vidra" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // Save PUTs the whole body to the W1 document endpoint.
  await save.click();
  await expect(editor.getByText("Saved.")).toBeVisible();
  expect(putBody).toEqual({ body: "# Welcome to **Vidra**" });

  // Clear asks for an inline confirmation, then PUTs an empty body.
  await editor.getByRole("button", { name: "Clear" }).click();
  expect(putBody).toEqual({ body: "# Welcome to **Vidra**" }); // not yet
  await editor
    .getByRole("button", { name: "Confirm clearing Homepage content" })
    .click();
  await expect(field).toHaveValue("");
  expect(putBody).toEqual({ body: "" });
});

test("W6 custom CSS saves directly; custom JS demands the typed confirmation", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  const puts: Record<string, string> = {};
  await page.route(DOCS, (route) => {
    const name = route.request().url().split("/").pop() ?? "";
    if (route.request().method() === "PUT") {
      const body = (route.request().postDataJSON() as { body: string }).body;
      puts[name] = body;
      return route.fulfill({
        json: { name, body, hash: body === "" ? "" : "cc33" },
      });
    }
    return route.fulfill({ json: { name, body: "", hash: "" } });
  });
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "Advanced" }).click();

  // Custom CSS: a code editor with the 200 KB counter; saving needs no ceremony.
  const css = page.getByRole("group", { name: "Custom CSS editor" });
  await expect(css.getByText("0 KB of 200 KB")).toBeVisible();
  await css.getByLabel("Custom CSS").fill(".site-header { display: none; }");
  await css.getByRole("button", { name: "Save custom css" }).click();
  await expect(css.getByText("Saved.")).toBeVisible();
  expect(puts.custom_css).toBe(".site-header { display: none; }");

  // Custom JS: danger-styled, gated behind the typed phrase.
  const js = page.getByRole("group", { name: "Custom JavaScript editor" });
  await js.getByLabel("Custom JavaScript").fill("console.log('ads');");
  await js.getByRole("button", { name: "Save custom javascript" }).click();
  const confirmDialog = page.getByRole("dialog");
  await expect(
    confirmDialog.getByRole("heading", {
      name: "This JavaScript runs in every visitor's browser",
    }),
  ).toBeVisible();
  const confirm = confirmDialog.getByRole("button", {
    name: "Save and run it",
  });
  await expect(confirm).toBeDisabled();
  expect(puts.custom_js).toBeUndefined(); // nothing sent yet

  // A wrong phrase keeps the save blocked; the exact phrase unlocks it.
  const phrase = confirmDialog.getByLabel(/run this code/);
  await phrase.fill("run code");
  await expect(confirm).toBeDisabled();
  await phrase.fill("run this code");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(js.getByText("Saved.")).toBeVisible();
  expect(puts.custom_js).toBe("console.log('ads');");
});

test("W6 customization: primary color with live contrast warnings + email keys", async ({
  page,
}) => {
  // The registry rows carry the REAL backend's W1 placement metadata (the W4
  // lesson: feed server rows WITH page/section so a registry/META divergence
  // fails here instead of being masked by the client fallback).
  const w6Settings = {
    settings: [
      ...settings.settings,
      {
        ...str("theme_primary_color"),
        page: "customization",
        section: "theme",
      },
      {
        ...str("email_subject_prefix"),
        page: "customization",
        section: "email",
      },
      {
        ...str("email_body_signature"),
        page: "customization",
        section: "email",
      },
    ],
  };
  // A deployment WITH outbound mail: the email rows are editable.
  await signIn(page, "admin", {
    ...instanceDoc,
    features: { ...instanceDoc.features, mail: true },
  });
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: w6Settings });
    return route.fallback();
  });
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "Customization" }).click();

  // The color control: hex input + live WCAG contrast feedback per theme.
  const color = page.getByLabel("Primary color");
  await color.fill("#7c5cff"); // the dead zone: warns for the light theme
  await expect(page.getByText(/Low contrast in the light theme/)).toBeVisible();
  await color.fill("#fbbf24"); // bright: dark passes, light warns
  await expect(page.getByText(/Low contrast in the light theme/)).toBeVisible();
  await expect(page.getByText(/Low contrast in the dark theme/)).toHaveCount(0);

  // The contrast warnings above are the CLIENT's — they are a WCAG judgement
  // about a value the server considers perfectly legal, and they never block a
  // save. Whether the value is legal at all is the server's call: an invalid hex
  // comes back from the dry run and blocks saving.
  await page.route(VALIDATE, (route) =>
    route.fulfill({
      json: {
        fields: [
          {
            field: "theme_primary_color",
            message: "must be a 6-digit hex color",
          },
        ],
      },
    }),
  );
  await color.fill("#12");
  await color.blur();
  await expect(page.getByText("must be a 6-digit hex color")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();

  await page.unroute(VALIDATE);
  await page.route(VALIDATE, (route) =>
    route.fulfill({ json: { fields: [] } }),
  );
  await color.fill("#1d4ed8");
  await expect(page.getByText("must be a 6-digit hex color")).toHaveCount(0);
  await expect(page.getByText(/Low contrast in the dark theme/)).toBeVisible();

  // The email presentation strings render under the Email section, editable,
  // with the {instance_name} substitution hint on the prefix.
  await expect(
    page.getByRole("heading", { name: "Email", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/\{instance_name\} to substitute/)).toBeVisible();
  const prefix = page.getByLabel("Email subject prefix");
  await expect(prefix).toBeEnabled();
  await prefix.fill("[{instance_name}]");
  await page.getByLabel("Email signature").fill("— the team");

  // The warning-but-valid color + both email strings travel in one PATCH.
  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: w6Settings.settings.map((s) => {
        if (s.key === "theme_primary_color")
          return { ...s, value: "#1d4ed8", overridden: true };
        if (s.key === "email_subject_prefix")
          return { ...s, value: "[{instance_name}]", overridden: true };
        if (s.key === "email_body_signature")
          return { ...s, value: "— the team", overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({
    theme_primary_color: "#1d4ed8",
    email_subject_prefix: "[{instance_name}]",
    email_body_signature: "— the team",
  });
});

test("W6 email keys render disabled-with-explanation when mail is not wired", async ({
  page,
}) => {
  const w6Settings = {
    settings: [
      ...settings.settings,
      {
        ...str("email_subject_prefix"),
        page: "customization",
        section: "email",
      },
      {
        ...str("email_body_signature"),
        page: "customization",
        section: "email",
      },
    ],
  };
  // features.mail === false: the boot capability is absent.
  await signIn(page, "admin", {
    ...instanceDoc,
    features: { ...instanceDoc.features, mail: false },
  });
  await page.route(SETTINGS, (route) => route.fulfill({ json: w6Settings }));
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "Customization" }).click();

  await expect(page.getByLabel("Email subject prefix")).toBeDisabled();
  await expect(page.getByLabel("Email signature")).toBeDisabled();
  await expect(
    page
      .getByText("Outgoing mail is not configured on this server (SMTP)", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
});

test("a form loaded from an older backend renders new fields disabled, not broken", async ({
  page,
}) => {
  await signIn(page, "admin");
  // Only the PRE-backport key set — none of the new platform-info keys.
  const legacy = {
    settings: [
      {
        key: "instance_name",
        type: "string",
        value: "Vidra",
        default: "Vidra",
        overridden: false,
      },
      str("instance_description"),
      str("terms_url"),
      str("privacy_url"),
      str("contact_email"),
      bool("registration_enabled", true),
      bool("registration_require_approval"),
      bool("uploads_enabled", true),
      bool("imports_enabled", true),
      bool("live_enabled"),
      bool("comments_enabled", true),
      bool("quarantine_new_uploads"),
    ],
  };
  await page.route(SETTINGS, (route) => route.fulfill({ json: legacy }));
  await openConfig(page);

  // The full structure still renders…
  await expect(page.getByRole("heading", { name: "About page" })).toBeVisible();
  await expect(page.getByText("Who is behind the instance?")).toBeVisible();
  // …but a key the server does not return is disabled (with honest copy), and
  // known keys stay editable.
  await expect(page.getByLabel("Short description")).toBeDisabled();
  await expect(
    page.getByText("Not supported by this server yet.").first(),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
});
