import { expect, test, type Page } from "@playwright/test";

// Mocked admin instance-configuration coverage (a real backend is not running in
// `npm run ci`; PATCH persistence against the real stack is proven in
// e2e-backed/instance-settings.spec.ts). Covers the config-parity W2 IA:
// /admin/config as a layout route with a persistent left rail of pages
// (general | vod | live | federation | customization | homepage | advanced),
// per-page grouped sections, progressive disclosure, inline validation, the
// per-section save, the badge-only-when-overridden rule with the config
// default displayed, and the metadata-driven auto-render invariant (unknown
// keys are never hidden; server page/section placement wins).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const SETTINGS = /\/api\/v1\/admin\/instance-settings$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const INSTANCE = /\/api\/v1\/instance$/;

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
    { key: "instance_name", type: "string", value: "Vidra", default: "Vidra", overridden: false },
    str("instance_short_description"),
    str("instance_description"),
    { key: "default_language", type: "string", value: "en", default: "en", overridden: false },
    {
      key: "instance_categories",
      type: "list",
      value: [],
      default: [],
      overridden: false,
    },
    { key: "moderator_languages", type: "list", value: ["en"], default: [], overridden: true },
    str("server_country"),
    str("terms_url", "https://terms.example", true),
    str("privacy_url"),
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
    { key: "import_max_height", type: "int", value: 1080, default: 1080, overridden: false },
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
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(INSTANCE, (route) => route.fulfill({ json: instance }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// Sign in as admin, then client-side navigate to the config page (keeps the
// in-memory session, unlike a hard goto). Lands on /admin/config, which
// redirects to the IA's first page: /admin/config/general.
async function openConfig(page: Page) {
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.route(VIDEO_CONFIG, (route) => route.fulfill({ json: videoConfig }));
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  // The desktop console (DR12) labels this destination "Instance".
  await page.getByRole("link", { name: "Instance" }).click();
  await expect(page).toHaveURL(/\/admin\/config\/general$/);
}

// The persistent left rail of config pages.
function configNav(page: Page) {
  return page.getByRole("navigation", { name: "Configuration pages" });
}

test("anonymous viewers are gated out of instance configuration", async ({ page }) => {
  let fetched = false;
  await page.route(SETTINGS, (route) => {
    fetched = true;
    return route.fulfill({ json: settings });
  });
  await page.goto("/admin/config");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular user gets no admin entry and is gated from config", async ({ page }) => {
  await signIn(page, "user");
  // No Admin entry point in the header for a non-admin.
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(SETTINGS, (route) => {
    fetched = true;
    return route.fulfill({ json: settings });
  });
  await page.goto("/admin/config/general");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("/admin/config redirects to the general page and shows the page rail", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);

  // The seven-page rail, in IA order.
  const nav = configNav(page);
  for (const label of [
    "General",
    "VOD",
    "Live",
    "Federation",
    "Customization",
    "Homepage",
    "Advanced",
  ]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "General" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the general page renders its sections with badge-only-when-overridden", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);

  // The general page's section structure, in order (uploads/limits moved to VOD).
  for (const title of [
    "Administrators",
    "Platform",
    "Social",
    "Moderation & sensitive content",
    "You and your platform",
    "Other information",
    "Sign-up & new users",
    "Comments",
  ]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
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
    page.getByRole("switch", { name: "This instance is dedicated to sensitive content" }),
  ).toBeVisible();

  // VOD/Live keys do NOT render here — they moved to their own pages.
  await expect(page.getByRole("switch", { name: "Video uploads" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Live streaming" })).toHaveCount(0);

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
  await expect(langs.getByRole("checkbox", { name: "French" })).not.toBeChecked();

  // Badge rule: ONLY overridden keys carry a badge (+ the config default and
  // the reset affordance); a key at its config default shows NO badge at all.
  await expect(page.getByText("Overridden")).toHaveCount(2); // terms_url + moderator_languages
  await expect(page.getByRole("button", { name: "Reset to default" })).toHaveCount(2);
  await expect(page.getByText("Default: empty")).toHaveCount(1); // terms_url's config default
  await expect(page.getByText("Default: none")).toHaveCount(1); // moderator_languages'

  // Save is disabled until something changes.
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
            key: "storyboards_enabled",
            type: "bool",
            value: true,
            default: true,
            overridden: false,
            page: "vod",
            section: "transcoding",
          },
          { key: "mystery_knob", type: "bool", value: false, default: false, overridden: false },
        ],
      },
    }),
  );
  await openConfig(page);
  const nav = configNav(page);

  // VOD: uploads/imports sections carry the toggles and limits that left General.
  await nav.getByRole("link", { name: "VOD" }).click();
  await expect(page.getByRole("heading", { name: "Uploads", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Imports", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Video uploads" })).toBeVisible();
  await expect(page.getByLabel("Import resolution cap")).toHaveValue("1080");
  // Server-placed unknown key: under the Transcoding section, fully editable.
  await expect(page.getByRole("heading", { name: "Transcoding", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "storyboards_enabled" })).toBeVisible();

  // Live: its master toggle lives here now.
  await nav.getByRole("link", { name: "Live" }).click();
  await expect(page.getByRole("switch", { name: "Live streaming" })).toBeVisible();

  // Federation: no runtime keys yet + a boot-dependency explanation.
  await nav.getByRole("link", { name: "Federation" }).click();
  await expect(page.getByText(/FEDERATION_ENABLED/)).toBeVisible();
  await expect(page.getByText("Nothing to configure here yet")).toBeVisible();

  // Customization/Homepage: honest empty states until their waves land.
  await nav.getByRole("link", { name: "Customization" }).click();
  await expect(page.getByText("Nothing to configure here yet")).toBeVisible();
  await nav.getByRole("link", { name: "Homepage" }).click();
  await expect(page.getByText("Nothing to configure here yet")).toBeVisible();

  // Advanced: the unplaced unknown key auto-renders under "Other settings".
  await nav.getByRole("link", { name: "Advanced" }).click();
  await expect(page.getByRole("heading", { name: "Other settings" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "mystery_knob" })).toBeVisible();
});

test("an admin edits settings and saves a partial patch (with progressive disclosure)", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Vidra");
  const registration = page.getByRole("switch", { name: "Allow new registrations" });
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
        if (s.key === "instance_name") return { ...s, value: "My Vidra", overridden: true };
        if (s.key === "registration_enabled") return { ...s, value: false, overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });

  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({ instance_name: "My Vidra", registration_enabled: false });

  // The saved values are reflected back (no longer dirty).
  await expect(save).toBeDisabled();
  await expect(registration).toHaveAttribute("aria-checked", "false");
});

test("per-section save patches only that section's changed keys", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: settings });
    return route.fallback();
  });
  await openConfig(page);

  // Dirty two sections: Administrators (contact_email) and Platform (name).
  await page.getByLabel("Admin email").fill("root@example.test");
  await page.getByLabel("Name", { exact: true }).fill("My Vidra");
  await expect(page.getByText("2 unsaved changes")).toBeVisible();

  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) =>
        s.key === "contact_email" ? { ...s, value: "root@example.test", overridden: true } : s,
      ),
    };
    return route.fulfill({ json: updated });
  });

  await page.getByRole("button", { name: "Save Administrators" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect(patchBody).toEqual({ contact_email: "root@example.test" });

  // The Platform edit survives as the one remaining pending change.
  await expect(page.getByText("1 unsaved change")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("My Vidra");
});

test("inline validation flags an out-of-range limit and blocks saving", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);
  await configNav(page).getByRole("link", { name: "VOD" }).click();

  const height = page.getByLabel("Import resolution cap");
  await expect(height).toHaveValue("1080");
  await height.fill("100");
  await expect(page.getByText("Must be 0 (no cap) or between 144 and 4320.")).toBeVisible();
  await expect(page.getByText("Fix the highlighted fields to save.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  // Fixing the value clears the error and re-enables saving.
  await height.fill("720");
  await expect(page.getByText("Must be 0 (no cap) or between 144 and 4320.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

test("segmented policy + multi-select changes patch as enum string and JSON array", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: settings });
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
  const categories = page.getByRole("group", { name: "Main instance categories" });
  await categories.getByRole("checkbox", { name: "Comedy" }).check();

  let patchBody: unknown = null;
  await page.route(SETTINGS, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patchBody = route.request().postDataJSON();
    const updated = {
      settings: settings.settings.map((s) => {
        if (s.key === "sensitive_content_policy")
          return { ...s, value: "blur", overridden: true };
        if (s.key === "instance_categories") return { ...s, value: ["7"], overridden: true };
        return s;
      }),
    };
    return route.fulfill({ json: updated });
  });

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  // Enum travels as a JSON string, the list as a JSON array.
  expect(patchBody).toEqual({ sensitive_content_policy: "blur", instance_categories: ["7"] });
});

test("the markdown Preview button opens the shared rendered-preview modal", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SETTINGS, (route) => route.fulfill({ json: settings }));
  await openConfig(page);

  await page
    .getByLabel("Description", { exact: true })
    .fill("## Welcome\n\nBe **excellent** to each other.");
  await page.getByRole("button", { name: "Preview Description", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The markdown renders as elements, not raw text.
  await expect(dialog.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(dialog.getByText("excellent")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a form loaded from an older backend renders new fields disabled, not broken", async ({
  page,
}) => {
  await signIn(page, "admin");
  // Only the PRE-backport key set — none of the new platform-info keys.
  const legacy = {
    settings: [
      { key: "instance_name", type: "string", value: "Vidra", default: "Vidra", overridden: false },
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
  await expect(page.getByRole("heading", { name: "You and your platform" })).toBeVisible();
  await expect(page.getByText("Who is behind the instance?")).toBeVisible();
  // …but a key the server does not return is disabled (with honest copy), and
  // known keys stay editable.
  await expect(page.getByLabel("Short description")).toBeDisabled();
  await expect(page.getByText("Not supported by this server yet.").first()).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
