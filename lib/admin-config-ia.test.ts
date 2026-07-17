import { describe, expect, it } from "vitest";

import {
  CONFIG_PAGES,
  META,
  OTHER_SECTION_ID,
  PAGE_SECTIONS,
  bootDepNote,
  buildPageModel,
  configPage,
  describeSettingDefault,
  humanizeSectionId,
  intRange,
  isConfigPageId,
  placementFor,
  validateHexColor,
  validateRungSet,
  validateTwitterHandle,
  zeroOrIntRange,
  type ConfigPageId,
  type PlacedInstanceSetting,
} from "./admin-config-ia";

function setting(key: string, extra: Partial<PlacedInstanceSetting> = {}): PlacedInstanceSetting {
  return { key, type: "string", value: "", default: "", overridden: false, ...extra };
}

// The authoritative server registry mirror (vidra-core
// internal/instancesettings/service.go `specs`): every mutable setting as a
// (key, page, RAW server section id) tuple, in registry order. The section ids
// are the server's snake_case form (normalized to slugs by the client). This
// fixture is what the section-id-drift + META-less coverage tests run against.
const SERVER_REGISTRY: Array<[string, ConfigPageId, string]> = [
  ["instance_name", "general", "identity"],
  ["instance_description", "general", "identity"],
  ["terms_url", "general", "about"],
  ["privacy_url", "general", "about"],
  ["contact_email", "general", "contact"],
  ["registration_enabled", "general", "signup"],
  ["registration_require_approval", "general", "signup"],
  ["quarantine_new_uploads", "general", "moderation"],
  ["uploads_enabled", "vod", "uploads"],
  ["imports_enabled", "vod", "imports"],
  ["live_enabled", "live", "streaming"],
  ["comments_enabled", "vod", "comments"],
  ["downloads_enabled", "vod", "downloads"],
  ["instance_short_description", "general", "identity"],
  ["server_country", "general", "identity"],
  ["support_text", "general", "about"],
  ["website_link", "general", "social"],
  ["mastodon_link", "general", "social"],
  ["x_link", "general", "social"],
  ["bluesky_link", "general", "social"],
  ["terms", "general", "about"],
  ["code_of_conduct", "general", "about"],
  ["moderation_info", "general", "about"],
  ["administrator_info", "general", "about"],
  ["creation_reason", "general", "about"],
  ["maintenance_lifetime", "general", "about"],
  ["business_model", "general", "about"],
  ["hardware_info", "general", "about"],
  ["default_language", "general", "identity"],
  ["contact_form_enabled", "general", "contact"],
  ["instance_is_sensitive", "general", "moderation"],
  ["sensitive_content_policy", "general", "moderation"],
  ["instance_categories", "general", "identity"],
  ["moderator_languages", "general", "identity"],
  ["default_user_quota_bytes", "vod", "uploads"],
  ["upload_max_size_bytes", "vod", "uploads"],
  ["upload_max_active_sessions_per_user", "vod", "uploads"],
  ["import_max_height", "vod", "imports"],
  ["broadcast_enabled", "general", "broadcast"],
  ["broadcast_message", "general", "broadcast"],
  ["broadcast_level", "general", "broadcast"],
  ["broadcast_dismissable", "general", "broadcast"],
  ["default_feed_sort", "general", "browse"],
  ["default_feed_scope", "general", "browse"],
  ["default_landing_page", "general", "browse"],
  ["miniature_prefer_author_display_name", "general", "browse"],
  ["default_video_privacy", "vod", "publish_defaults"],
  ["default_video_licence", "vod", "publish_defaults"],
  ["default_comment_policy", "vod", "publish_defaults"],
  ["default_download_enabled", "vod", "publish_defaults"],
  ["default_theme", "customization", "theme"],
  ["theme_primary_color", "customization", "theme"],
  ["header_hide_instance_name", "customization", "header"],
  ["default_player_autoplay", "customization", "player"],
  ["email_subject_prefix", "customization", "email"],
  ["email_body_signature", "customization", "email"],
  ["social_meta_twitter_username", "general", "social"],
  ["import_http_enabled", "vod", "imports"],
  ["channel_sync_enabled", "vod", "imports"],
  ["channel_sync_max_per_user", "vod", "imports"],
  ["storyboards_enabled", "vod", "storyboards"],
  ["video_card_previews_enabled", "vod", "playback"],
  ["video_card_previews_default_enabled", "vod", "playback"],
  ["transcription_enabled", "vod", "transcription"],
  ["user_import_enabled", "advanced", "user_data"],
  ["user_export_enabled", "advanced", "user_data"],
  ["user_export_expiration_hours", "advanced", "user_data"],
  ["user_export_max_quota_bytes", "advanced", "user_data"],
  ["search_service_enabled", "advanced", "search"],
  ["search_mode", "advanced", "search"],
  ["search_suggestions_enabled", "advanced", "search"],
  ["personalized_search_enabled", "advanced", "search"],
  ["personalized_recommendations_enabled", "advanced", "search"],
  ["search_history_enabled", "advanced", "search"],
  ["search_event_retention_days", "advanced", "search"],
  ["search_min_query_user_count", "advanced", "search"],
  ["max_channels_per_user", "general", "channels"],
  ["transcoding_enabled", "vod", "transcoding"],
  ["transcoding_resolutions", "vod", "transcoding"],
  ["transcoding_max_fps", "vod", "transcoding"],
  ["transcoding_threads", "vod", "transcoding"],
  ["transcoding_concurrency", "vod", "transcoding"],
  ["transcoding_original_resolution", "vod", "transcoding"],
  ["import_jobs_concurrency", "vod", "imports"],
  ["upload_additional_extensions_enabled", "vod", "uploads"],
  ["video_replace_enabled", "vod", "uploads"],
  ["live_allow_replay", "live", "replay"],
  ["live_default_save_replay", "live", "replay"],
  ["live_max_instance_lives", "live", "limits"],
  ["live_max_user_lives", "live", "limits"],
  ["live_max_duration_secs", "live", "limits"],
  ["federation_accept_remote_comments", "federation", "comments"],
  ["federation_allow_channel_followers", "federation", "followers"],
  ["federation_follower_approval", "federation", "followers"],
  ["federation_auto_follow_back", "federation", "followers"],
  ["search_remote_uri_users", "federation", "search"],
  ["search_remote_uri_anonymous", "federation", "search"],
  ["registration_require_email_verification", "general", "signup"],
  ["registration_user_limit", "general", "signup"],
  ["registration_minimum_age", "general", "signup"],
  ["new_user_history_enabled", "general", "signup"],
  ["default_user_daily_quota_bytes", "vod", "uploads"],
];

describe("config pages", () => {
  it("exposes the eight-page IA in order", () => {
    expect(CONFIG_PAGES.map((p) => p.id)).toEqual([
      "general",
      "vod",
      "live",
      "federation",
      "customization",
      "homepage",
      "ipfs",
      "advanced",
    ]);
  });

  it("isConfigPageId accepts exactly the known pages", () => {
    expect(isConfigPageId("vod")).toBe(true);
    expect(isConfigPageId("videos")).toBe(false);
    expect(isConfigPageId(undefined)).toBe(false);
  });

  it("every META key points at a known page and a declared section", () => {
    for (const [key, meta] of Object.entries(META)) {
      expect(isConfigPageId(meta.page), `${key} page`).toBe(true);
      const sections = PAGE_SECTIONS[meta.page].map((s) => s.id);
      expect(sections, `${key} section ${meta.section} on ${meta.page}`).toContain(meta.section);
    }
  });

  it("the federation page carries a boot note when federation is off", () => {
    const note = configPage("federation").bootNote;
    expect(note?.({ federation_enabled: false })).toMatch(/FEDERATION_ENABLED/);
    expect(note?.({ federation_enabled: true })).toBeNull();
  });
});

describe("placementFor", () => {
  it("uses the client META map when the server sends no placement", () => {
    expect(placementFor("instance_name")).toEqual({ page: "general", section: "identity" });
    expect(placementFor("uploads_enabled")).toEqual({ page: "vod", section: "uploads" });
    expect(placementFor("live_enabled")).toEqual({ page: "live", section: "streaming" });
  });

  it("places the broadcast slice on general/broadcast, disclosed under its master toggle", () => {
    for (const key of [
      "broadcast_enabled",
      "broadcast_message",
      "broadcast_level",
      "broadcast_dismissable",
    ]) {
      expect(placementFor(key), key).toEqual({ page: "general", section: "broadcast" });
    }
    expect(META.broadcast_enabled.parent).toBeUndefined();
    expect(META.broadcast_message.parent).toBe("broadcast_enabled");
    expect(META.broadcast_level.parent).toBe("broadcast_enabled");
    expect(META.broadcast_dismissable.parent).toBe("broadcast_enabled");
    expect(META.broadcast_message.control).toBe("markdown");
    expect(META.broadcast_level.control).toBe("level-segmented");
  });

  it("server page/section metadata wins over the client map", () => {
    expect(
      placementFor("uploads_enabled", { page: "general", section: "identity" }),
    ).toEqual({ page: "general", section: "identity" });
  });

  it("a server page without a usable section keeps the client section when pages agree", () => {
    expect(placementFor("uploads_enabled", { page: "vod" })).toEqual({
      page: "vod",
      section: "uploads",
    });
    // Pages disagree: the page's auto-render fallback.
    expect(placementFor("uploads_enabled", { page: "live" })).toEqual({
      page: "live",
      section: OTHER_SECTION_ID,
    });
  });

  it("an unknown key with server placement lands where the server says", () => {
    expect(
      placementFor("future_unknown_knob", { page: "vod", section: "transcoding" }),
    ).toEqual({ page: "vod", section: "transcoding" });
  });

  it("an unknown key without placement falls back to advanced/other", () => {
    expect(placementFor("mystery_knob")).toEqual({ page: "advanced", section: OTHER_SECTION_ID });
  });

  it("an invalid server page falls back to the client map", () => {
    expect(placementFor("instance_name", { page: "bogus", section: "identity" })).toEqual({
      page: "general",
      section: "identity",
    });
  });
});

describe("buildPageModel", () => {
  it("renders META keys even when the server does not return them", () => {
    const model = buildPageModel("live", []);
    // The live page mirrors the server's streaming/replay/limits sections.
    expect(model.map((s) => s.section.id)).toEqual(["streaming", "replay", "limits"]);
    expect(model[0].keys).toEqual(["live_enabled"]);
    expect(model.find((s) => s.section.id === "replay")?.keys).toEqual([
      "live_allow_replay",
      "live_default_save_replay",
    ]);
    expect(model.find((s) => s.section.id === "limits")?.keys).toEqual([
      "live_max_instance_lives",
      "live_max_user_lives",
      "live_max_duration_secs",
    ]);
  });

  it("puts an unknown key with server metadata under the named section", () => {
    const model = buildPageModel("vod", [
      setting("clamav_enabled", { type: "bool", value: false, default: false, page: "vod", section: "transcoding" }),
    ]);
    const transcoding = model.find((s) => s.section.id === "transcoding");
    expect(transcoding?.section.title).toBe("Transcoding");
    // The curated transcoding keys land here too; the unknown server key joins them.
    expect(transcoding?.keys).toContain("clamav_enabled");
    expect(transcoding?.keys).toContain("transcoding_enabled");
  });

  it("auto-creates a titled section for a server-invented section id", () => {
    const model = buildPageModel("vod", [
      setting("clamav_enabled", { type: "bool", value: false, default: false, page: "vod", section: "virus-scanning" }),
    ]);
    const auto = model.find((s) => s.section.id === "virus-scanning");
    expect(auto?.section.title).toBe("Virus scanning");
    expect(auto?.keys).toEqual(["clamav_enabled"]);
    // Auto sections render after the known ones, before "Other settings".
    expect(model[model.length - 1].section.id).toBe("virus-scanning");
  });

  it("keeps the Other settings fallback as the page's last section", () => {
    const model = buildPageModel("advanced", [setting("mystery_knob")]);
    expect(model[model.length - 1].section.id).toBe(OTHER_SECTION_ID);
    expect(model[model.length - 1].keys).toEqual(["mystery_knob"]);
  });

  it("every currently-known key appears on exactly one page", () => {
    const seen = new Map<string, number>();
    for (const page of CONFIG_PAGES) {
      for (const section of buildPageModel(page.id, [])) {
        for (const key of section.keys) seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(Object.keys(META).length);
    for (const [key, count] of seen) expect(count, key).toBe(1);
  });
});

describe("validators", () => {
  it("validateHexColor accepts empty and #rrggbb only", () => {
    expect(validateHexColor("")).toBeNull();
    expect(validateHexColor("#7c5cff")).toBeNull();
    expect(validateHexColor("#7C5CFF")).toBeNull();
    expect(validateHexColor("#fff")).toMatch(/hex/);
    expect(validateHexColor("red")).toMatch(/hex/);
  });

  it("zeroOrIntRange keeps the 0=unlimited convention", () => {
    const check = zeroOrIntRange(144, 4320, "bad");
    expect(check(0)).toBeNull();
    expect(check(1080)).toBeNull();
    expect(check(100)).toBe("bad");
    expect(check(9999)).toBe("bad");
    // Non-numbers are the server's problem, not inline validation's.
    expect(check("x")).toBeNull();
  });

  it("META wires inline validation for the int-range limit keys", () => {
    expect(META.import_max_height.validate?.(100)).toMatch(/144/);
    expect(META.import_max_height.validate?.(0)).toBeNull();
    expect(META.upload_max_size_bytes.validate?.(1024)).toMatch(/MiB/);
    expect(META.upload_max_size_bytes.validate?.(1048576)).toBeNull();
  });

  it("validateTwitterHandle accepts empty and @?[A-Za-z0-9_]{1,15} only (W4)", () => {
    expect(validateTwitterHandle("")).toBeNull();
    expect(validateTwitterHandle("@vidra")).toBeNull();
    expect(validateTwitterHandle("vidra")).toBeNull();
    expect(validateTwitterHandle("Vi_dra42")).toBeNull();
    expect(validateTwitterHandle("@way_too_long_handle")).toMatch(/handle/);
    expect(validateTwitterHandle("no spaces")).toMatch(/handle/);
    expect(validateTwitterHandle("dot.com")).toMatch(/handle/);
  });
});

describe("W4 branding & social identity placement", () => {
  it("places the hide-name toggle in customization/header and the handle in general/social", () => {
    // The META fallback MATCHES the server registry placement (vidra-core
    // instancesettings: PageCustomization/"header" and PageGeneral/"social"),
    // so a pre-metadata backend and the real one agree.
    expect(placementFor("header_hide_instance_name")).toEqual({
      page: "customization",
      section: "header",
    });
    expect(placementFor("social_meta_twitter_username")).toEqual({
      page: "general",
      section: "social",
    });
    expect(META.social_meta_twitter_username.validate).toBe(validateTwitterHandle);
  });

  it("agrees with the real backend's server placement rows for the W4 keys", () => {
    expect(
      placementFor("header_hide_instance_name", { page: "customization", section: "header" }),
    ).toEqual({ page: "customization", section: "header" });
    expect(
      placementFor("social_meta_twitter_username", { page: "general", section: "social" }),
    ).toEqual({ page: "general", section: "social" });
  });

  it("declares the Branding section on the general page (the assets panel's home)", () => {
    expect(PAGE_SECTIONS.general.map((s) => s.id)).toContain("branding");
    expect(PAGE_SECTIONS.customization.map((s) => s.id)).toContain("header");
  });

  it("the general page model carries the key-less Branding panel section regardless of registry placement", () => {
    // The regression the review caught: with the real backend's rows (the
    // hide-name toggle server-placed at customization/header), no registry
    // key lands in general/branding — the panel section must render anyway.
    const serverRows = [
      setting("header_hide_instance_name", {
        type: "bool",
        value: false,
        default: false,
        page: "customization",
        section: "header",
      }),
    ];
    const general = buildPageModel("general", serverRows);
    const branding = general.find((s) => s.section.id === "branding");
    expect(branding).toBeDefined();
    expect(branding?.keys).toEqual([]);
    // …and the toggle itself renders on the customization page's Header section.
    const customization = buildPageModel("customization", serverRows);
    const header = customization.find((s) => s.section.id === "header");
    expect(header?.section.title).toBe("Header");
    expect(header?.keys).toEqual(["header_hide_instance_name"]);
  });
});

describe("W5 browse, landing & player defaults placement", () => {
  const W5_ENUM_KEYS = ["default_landing_page", "default_feed_sort", "default_feed_scope"];

  it("places the browse keys in general/browse, matching the backend registry", () => {
    // vidra-core instancesettings: PageGeneral/"browse" for the four browse
    // keys — the META fallback must agree so a pre-metadata backend and the
    // real one render identically.
    for (const key of [...W5_ENUM_KEYS, "miniature_prefer_author_display_name"]) {
      expect(placementFor(key)).toEqual({ page: "general", section: "browse" });
      expect(placementFor(key, { page: "general", section: "browse" })).toEqual({
        page: "general",
        section: "browse",
      });
    }
    expect(PAGE_SECTIONS.general.map((s) => s.id)).toContain("browse");
  });

  it("places the theme default in customization/theme and autoplay in customization/player", () => {
    expect(placementFor("default_theme")).toEqual({ page: "customization", section: "theme" });
    expect(placementFor("default_player_autoplay")).toEqual({
      page: "customization",
      section: "player",
    });
    expect(PAGE_SECTIONS.customization.map((s) => s.id)).toContain("player");
  });

  it("renders the enum keys as segmented pickers whose options mirror the backend enums", () => {
    expect(META.default_feed_sort.control).toBe("enum-segmented");
    expect(META.default_feed_sort.options?.map((o) => o.value)).toEqual([
      "recent",
      "popular",
      "trending",
    ]);
    expect(META.default_feed_scope.options?.map((o) => o.value)).toEqual(["local", "all"]);
    expect(META.default_landing_page.options?.map((o) => o.value)).toEqual([
      "home-recent",
      "trending",
      "local",
      "home",
    ]);
    expect(META.default_theme.options?.map((o) => o.value)).toEqual([
      "system",
      "light",
      "dark",
    ]);
    // Every enum-segmented META entry must carry its options.
    for (const [key, meta] of Object.entries(META)) {
      if (meta.control === "enum-segmented") {
        expect(meta.options?.length, key).toBeGreaterThan(0);
      }
    }
    // The two flags stay plain toggles.
    expect(META.miniature_prefer_author_display_name.control).toBe("toggle");
    expect(META.default_player_autoplay.control).toBe("toggle");
  });

  it("builds the general page with the browse section holding the four keys in META order", () => {
    const browse = buildPageModel("general", []).find((s) => s.section.id === "browse");
    expect(browse?.section.title).toBe("Landing & browse defaults");
    expect(browse?.keys).toEqual([
      "default_landing_page",
      "default_feed_sort",
      "default_feed_scope",
      "miniature_prefer_author_display_name",
    ]);
  });
});

describe("display helpers", () => {
  it("humanizes server-invented section ids", () => {
    expect(humanizeSectionId("channel-sync")).toBe("Channel sync");
    expect(humanizeSectionId("virus_scanning")).toBe("Virus scanning");
    expect(humanizeSectionId("")).toBe("Settings");
  });

  it("describes defaults per control kind", () => {
    expect(
      describeSettingDefault(setting("k", { type: "bool", default: true }), "toggle"),
    ).toBe("on");
    expect(
      describeSettingDefault(setting("k", { type: "int", default: 0 }), "bytes"),
    ).toBe("unlimited");
    expect(
      describeSettingDefault(setting("k", { type: "int", default: 2097152 }), "bytes"),
    ).toMatch(/MiB|MB/);
    expect(
      describeSettingDefault(setting("k", { type: "list", default: ["en", "fr"] }), "language-multi"),
    ).toBe("en, fr");
    expect(describeSettingDefault(setting("k", { default: "" }), "text")).toBe("empty");
  });

  it("bootDepNote explains an absent boot dependency and stays quiet otherwise", () => {
    const meta = {
      label: "x",
      control: "toggle" as const,
      page: "vod" as const,
      section: "uploads",
      bootDep: {
        note: "Needs WHISPER_ENDPOINT.",
        isSatisfied: (i: { federation_enabled?: boolean }) => i.federation_enabled === true,
      },
    };
    expect(bootDepNote(meta, { federation_enabled: false })).toBe("Needs WHISPER_ENDPOINT.");
    expect(bootDepNote(meta, { federation_enabled: true })).toBeNull();
    // No snapshot yet / no dependency declared: no note.
    expect(bootDepNote(meta, null)).toBeNull();
    expect(bootDepNote(META.instance_name, { federation_enabled: false })).toBeNull();
  });
});

describe("publish defaults placement (config-parity W9)", () => {
  const keys = [
    "default_video_privacy",
    "default_video_licence",
    "default_comment_policy",
    "default_download_enabled",
  ];

  it("places every defaults.publish key on vod/publish-defaults via META", () => {
    for (const key of keys) {
      expect(placementFor(key)).toEqual({ page: "vod", section: "publish-defaults" });
    }
  });

  it("the server's publish_defaults section normalizes into the declared vod section", () => {
    // vidra-core sends section "publish_defaults"; the slug must land in the
    // pre-declared "publish-defaults" section (title + description intact).
    const placement = placementFor("default_video_privacy", {
      page: "vod",
      section: "publish_defaults",
    });
    expect(placement).toEqual({ page: "vod", section: "publish-defaults" });
    expect(PAGE_SECTIONS.vod.some((s) => s.id === "publish-defaults")).toBe(true);

    const sections = buildPageModel("vod", keys.map((k) => setting(k, { page: "vod", section: "publish_defaults" })));
    const publish = sections.find((s) => s.section.id === "publish-defaults");
    expect(publish?.section.title).toBe("Publish defaults");
    for (const key of keys) expect(publish?.keys).toContain(key);
  });

  it("default_video_licence validates 0 or a PT-compatible licence id", () => {
    const validate = META.default_video_licence.validate!;
    expect(validate(0)).toBeNull();
    expect(validate(3)).toBeNull();
    expect(validate(8)).not.toBeNull();
  });
});

describe("server registry mirror (config-parity closure slice)", () => {
  it("curates a META entry for every server registry key (no raw snake_case rows)", () => {
    for (const [key] of SERVER_REGISTRY) {
      expect(META[key], `${key} has a curated META entry`).toBeDefined();
    }
  });

  it("has no META entry the server registry does not know (the two sets match 1:1)", () => {
    const known = new Set(SERVER_REGISTRY.map(([key]) => key));
    for (const key of Object.keys(META)) expect(known.has(key), key).toBe(true);
    expect(Object.keys(META).length).toBe(SERVER_REGISTRY.length);
  });

  it("places every server key under a DECLARED section on its page — never stranded in Other/auto", () => {
    for (const [key, page, section] of SERVER_REGISTRY) {
      const placement = placementFor(key, { page, section });
      expect(placement.page, key).toBe(page);
      const declared = PAGE_SECTIONS[placement.page].map((s) => s.id);
      // The MIRROR RULE: the normalized server section is a real curated header.
      expect(declared, `${key} → ${page}/${section}`).toContain(placement.section);
      expect(placement.section, key).not.toBe(OTHER_SECTION_ID);
    }
  });

  it("client META fallback AGREES with server placement for every key (no section-id drift)", () => {
    for (const [key, page, section] of SERVER_REGISTRY) {
      const slug = section.replace(/_/g, "-"); // server snake_case → client slug
      expect(META[key].page, `${key} page`).toBe(page);
      expect(META[key].section, `${key} section`).toBe(slug);
    }
  });

  it("builds every page with server rows landing only in declared sections (no auto ids)", () => {
    const rows = SERVER_REGISTRY.map(([key, page, section]) => setting(key, { page, section }));
    for (const p of CONFIG_PAGES) {
      const model = buildPageModel(p.id, rows);
      const declared = new Set(PAGE_SECTIONS[p.id].map((d) => d.id));
      for (const s of model) {
        expect(declared.has(s.section.id), `${p.id} rendered auto section ${s.section.id}`).toBe(
          true,
        );
      }
    }
  });

  it("labels the four ActivityPub federation gates and nothing else", () => {
    const gates = [
      "federation_accept_remote_comments",
      "federation_allow_channel_followers",
      "federation_follower_approval",
      "federation_auto_follow_back",
    ];
    for (const key of gates) expect(META[key].protocol, key).toBe("activitypub");
    // The remote-search keys deliberately carry NO protocol badge.
    expect(META.search_remote_uri_users.protocol).toBeUndefined();
    // No key claims ATProto coverage (vidra has no inbound ATProto gate).
    for (const meta of Object.values(META)) {
      if (meta.protocol) expect(meta.protocol).toBe("activitypub");
    }
  });

  it("wires the two-level live replay disclosure", () => {
    expect(META.live_allow_replay.parent).toBe("live_enabled");
    expect(META.live_default_save_replay.parent).toBe("live_allow_replay");
    expect(META.channel_sync_max_per_user.parent).toBe("channel_sync_enabled");
  });
});

describe("transcoding_resolutions list control (config-parity W1/W10)", () => {
  it("is the only list-kind META key and renders via the list control", () => {
    expect(META.transcoding_resolutions.control).toBe("list");
    expect(META.transcoding_resolutions.options?.map((o) => o.value)).toContain("1080");
  });

  it("validateRungSet rejects empty and duplicate rung sets, accepts a clean list", () => {
    expect(validateRungSet(["1080", "720"])).toBeNull();
    expect(validateRungSet([])).toMatch(/at least one/);
    expect(validateRungSet(["1080", "1080"])).toMatch(/twice/);
    expect(validateRungSet(["1080", ""])).toMatch(/blank/);
    // Non-arrays are the server's problem, not inline validation's.
    expect(validateRungSet("1080")).toBeNull();
  });

  it("intRange requires a bounded integer (concurrency knobs, no 0 sentinel)", () => {
    const check = intRange(1, 16, "bad");
    expect(check(1)).toBeNull();
    expect(check(16)).toBeNull();
    expect(check(0)).toBe("bad");
    expect(check(17)).toBe("bad");
    expect(check("x")).toBeNull();
  });
});
