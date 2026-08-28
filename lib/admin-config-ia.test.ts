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
  isConfigPageId,
  pageHasWiringChecks,
  placementFor,
  wiringWarnNote,
  type ConfigPageId,
  type InfrastructureWiringInfo,
  type PlacedInstanceSetting,
} from "./admin-config-ia";

function setting(
  key: string,
  extra: Partial<PlacedInstanceSetting> = {},
): PlacedInstanceSetting {
  return {
    key,
    type: "string",
    value: "",
    default: "",
    overridden: false,
    ...extra,
  };
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
  ["report_email_alerts_enabled", "general", "contact"],
  ["instance_is_sensitive", "general", "moderation"],
  ["sensitive_content_policy", "general", "moderation"],
  ["instance_categories", "general", "identity"],
  ["instance_custom_categories", "general", "identity"],
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
  ["browse_scroll_mode", "general", "browse"],
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
  ["featured_enabled", "homepage", "featured"],
  ["featured_video_id", "homepage", "featured"],
  ["featured_title", "homepage", "featured"],
  ["featured_description", "homepage", "featured"],
  ["featured_cta_label", "homepage", "featured"],
  ["featured_label", "homepage", "featured"],
  ["delivery_presign_enabled", "advanced", "delivery"],
  ["delivery_cdn_enabled", "advanced", "delivery"],
  ["qoe_collection_enabled", "advanced", "delivery"],
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
      expect(
        sections,
        `${key} section ${meta.section} on ${meta.page}`,
      ).toContain(meta.section);
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
    expect(placementFor("instance_name")).toEqual({
      page: "general",
      section: "identity",
    });
    expect(placementFor("uploads_enabled")).toEqual({
      page: "vod",
      section: "uploads",
    });
    expect(placementFor("live_enabled")).toEqual({
      page: "live",
      section: "streaming",
    });
  });

  it("places the broadcast slice on general/broadcast, disclosed under its master toggle", () => {
    for (const key of [
      "broadcast_enabled",
      "broadcast_message",
      "broadcast_level",
      "broadcast_dismissable",
    ]) {
      expect(placementFor(key), key).toEqual({
        page: "general",
        section: "broadcast",
      });
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
      placementFor("future_unknown_knob", {
        page: "vod",
        section: "transcoding",
      }),
    ).toEqual({ page: "vod", section: "transcoding" });
  });

  it("an unknown key without placement falls back to advanced/other", () => {
    expect(placementFor("mystery_knob")).toEqual({
      page: "advanced",
      section: OTHER_SECTION_ID,
    });
  });

  it("an invalid server page falls back to the client map", () => {
    expect(
      placementFor("instance_name", { page: "bogus", section: "identity" }),
    ).toEqual({
      page: "general",
      section: "identity",
    });
  });
});

describe("buildPageModel", () => {
  it("renders META keys even when the server does not return them", () => {
    const model = buildPageModel("live", []);
    // The live page mirrors the server's streaming/replay/limits sections.
    expect(model.map((s) => s.section.id)).toEqual([
      "streaming",
      "replay",
      "limits",
    ]);
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
      setting("clamav_enabled", {
        type: "bool",
        value: false,
        default: false,
        page: "vod",
        section: "transcoding",
      }),
    ]);
    const transcoding = model.find((s) => s.section.id === "transcoding");
    expect(transcoding?.section.title).toBe("Transcoding");
    // The curated transcoding keys land here too; the unknown server key joins them.
    expect(transcoding?.keys).toContain("clamav_enabled");
    expect(transcoding?.keys).toContain("transcoding_enabled");
  });

  it("auto-creates a titled section for a server-invented section id", () => {
    const model = buildPageModel("vod", [
      setting("clamav_enabled", {
        type: "bool",
        value: false,
        default: false,
        page: "vod",
        section: "virus-scanning",
      }),
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
  });

  it("agrees with the real backend's server placement rows for the W4 keys", () => {
    expect(
      placementFor("header_hide_instance_name", {
        page: "customization",
        section: "header",
      }),
    ).toEqual({ page: "customization", section: "header" });
    expect(
      placementFor("social_meta_twitter_username", {
        page: "general",
        section: "social",
      }),
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
  const W5_ENUM_KEYS = [
    "default_landing_page",
    "default_feed_sort",
    "default_feed_scope",
  ];

  it("places the browse keys in general/browse, matching the backend registry", () => {
    // vidra-core instancesettings: PageGeneral/"browse" for the four browse
    // keys — the META fallback must agree so a pre-metadata backend and the
    // real one render identically.
    for (const key of [
      ...W5_ENUM_KEYS,
      "miniature_prefer_author_display_name",
    ]) {
      expect(placementFor(key)).toEqual({ page: "general", section: "browse" });
      expect(placementFor(key, { page: "general", section: "browse" })).toEqual(
        {
          page: "general",
          section: "browse",
        },
      );
    }
    expect(PAGE_SECTIONS.general.map((s) => s.id)).toContain("browse");
  });

  it("places the theme default in customization/theme and autoplay in customization/player", () => {
    expect(placementFor("default_theme")).toEqual({
      page: "customization",
      section: "theme",
    });
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
    expect(META.default_feed_scope.options?.map((o) => o.value)).toEqual([
      "local",
      "all",
    ]);
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

  it("builds the general page with the browse section holding the five keys in META order", () => {
    const browse = buildPageModel("general", []).find(
      (s) => s.section.id === "browse",
    );
    expect(browse?.section.title).toBe("Landing & browse defaults");
    expect(browse?.keys).toEqual([
      "default_landing_page",
      "default_feed_sort",
      "default_feed_scope",
      "browse_scroll_mode",
      "miniature_prefer_author_display_name",
    ]);
  });

  // browse_scroll_mode is KindEnum server-side (button|auto). Before it had a
  // META entry it fell through controlFor() to a plain text row — an enum
  // edited as free text, where every typo is a 422 the operator only sees on
  // save. The segmented picker is the fix; the options must stay in lockstep
  // with vidra-core BrowseScrollModeOptions.
  it("renders browse_scroll_mode as a segmented picker over the backend enum", () => {
    expect(META.browse_scroll_mode.control).toBe("enum-segmented");
    expect(META.browse_scroll_mode.options?.map((o) => o.value)).toEqual([
      "button",
      "auto",
    ]);
    expect(META.browse_scroll_mode.help).toBeTruthy();
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
      describeSettingDefault(
        setting("k", { type: "bool", default: true }),
        "toggle",
      ),
    ).toBe("on");
    expect(
      describeSettingDefault(
        setting("k", { type: "int", default: 0 }),
        "bytes",
      ),
    ).toBe("unlimited");
    expect(
      describeSettingDefault(
        setting("k", { type: "int", default: 2097152 }),
        "bytes",
      ),
    ).toMatch(/MiB|MB/);
    expect(
      describeSettingDefault(
        setting("k", { type: "list", default: ["en", "fr"] }),
        "language-multi",
      ),
    ).toBe("en, fr");
    expect(describeSettingDefault(setting("k", { default: "" }), "text")).toBe(
      "empty",
    );
  });

  it("bootDepNote explains an absent boot dependency and stays quiet otherwise", () => {
    const meta = {
      label: "x",
      control: "toggle" as const,
      page: "vod" as const,
      section: "uploads",
      bootDep: {
        note: "Needs WHISPER_ENDPOINT.",
        isSatisfied: (i: { federation_enabled?: boolean }) =>
          i.federation_enabled === true,
      },
    };
    expect(bootDepNote(meta, { federation_enabled: false })).toBe(
      "Needs WHISPER_ENDPOINT.",
    );
    expect(bootDepNote(meta, { federation_enabled: true })).toBeNull();
    // No snapshot yet / no dependency declared: no note.
    expect(bootDepNote(meta, null)).toBeNull();
    expect(
      bootDepNote(META.instance_name, { federation_enabled: false }),
    ).toBeNull();
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
      expect(placementFor(key)).toEqual({
        page: "vod",
        section: "publish-defaults",
      });
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
    expect(PAGE_SECTIONS.vod.some((s) => s.id === "publish-defaults")).toBe(
      true,
    );

    const sections = buildPageModel(
      "vod",
      keys.map((k) => setting(k, { page: "vod", section: "publish_defaults" })),
    );
    const publish = sections.find((s) => s.section.id === "publish-defaults");
    expect(publish?.section.title).toBe("Publish defaults");
    for (const key of keys) expect(publish?.keys).toContain(key);
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
      expect(declared, `${key} → ${page}/${section}`).toContain(
        placement.section,
      );
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
    const rows = SERVER_REGISTRY.map(([key, page, section]) =>
      setting(key, { page, section }),
    );
    for (const p of CONFIG_PAGES) {
      const model = buildPageModel(p.id, rows);
      const declared = new Set(PAGE_SECTIONS[p.id].map((d) => d.id));
      for (const s of model) {
        expect(
          declared.has(s.section.id),
          `${p.id} rendered auto section ${s.section.id}`,
        ).toBe(true);
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
    for (const key of gates)
      expect(META[key].protocol, key).toBe("activitypub");
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

describe("list-kind META keys (config-parity W1/W10)", () => {
  it("renders the two server list kinds through the list control", () => {
    // The ladder carries a suggestion set (the canonical rung heights); the
    // custom taxonomy deliberately carries none — its whole point is ids this
    // client cannot know, so the server stays the only validator.
    expect(META.transcoding_resolutions.control).toBe("list");
    expect(META.transcoding_resolutions.options?.map((o) => o.value)).toContain(
      "1080",
    );
    expect(META.instance_custom_categories.control).toBe("list");
    expect(META.instance_custom_categories.options).toBeUndefined();
    expect(
      Object.entries(META)
        .filter(([, meta]) => meta.control === "list")
        .map(([key]) => key)
        .sort(),
    ).toEqual(["instance_custom_categories", "transcoding_resolutions"]);
  });
});

// The Advanced page's delivery slice. Before these three had META entries they
// rendered as raw snake_case rows under an auto-titled, description-less
// header: an unlabeled toggle forest on the one page an operator reaches while
// something is already wrong. Every row here must carry a label AND help.
describe("ADVANCED / Delivery (phase-2 item 6, phase-4 items 2 & 4)", () => {
  const DELIVERY_KEYS = [
    "delivery_presign_enabled",
    "delivery_cdn_enabled",
    "qoe_collection_enabled",
  ];

  it("places all three under the curated Delivery section, as toggles", () => {
    for (const key of DELIVERY_KEYS) {
      expect(placementFor(key), key).toEqual({
        page: "advanced",
        section: "delivery",
      });
      expect(META[key].control, key).toBe("toggle");
    }
    const delivery = PAGE_SECTIONS.advanced.find((s) => s.id === "delivery");
    expect(delivery?.title).toBe("Delivery");
    expect(delivery?.description).toContain("media bytes reach viewers");
  });

  it("builds the section with a real title instead of the humanized key", () => {
    const rows = DELIVERY_KEYS.map((key) =>
      setting(key, { type: "bool", page: "advanced", section: "delivery" }),
    );
    const section = buildPageModel("advanced", rows).find(
      (s) => s.section.id === "delivery",
    );
    expect(section?.section.title).toBe("Delivery");
    expect(section?.section.description).not.toBe("");
    expect(section?.keys).toEqual(DELIVERY_KEYS);
  });

  // Operator-honest help: each toggle names the boot-side condition that makes
  // it do anything, because "on" plus "inert" is the state these rows exist to
  // stop an operator from misreading at 3am.
  it("names each toggle's real precondition in its help text", () => {
    expect(META.delivery_presign_enabled.help).toContain("S3 storage backend");
    expect(META.delivery_cdn_enabled.help).toContain("DELIVERY_CDN_BASE_URL");
    expect(META.qoe_collection_enabled.help).toContain("Playback health");
  });

  // Presign on S3 has a prerequisite whose failure mode is NOT benign: a
  // bucket whose CORS policy does not allow this site's origin fails every
  // in-browser segment fetch platform-wide (a real incident class). The help
  // must say so instead of framing the toggle as worst-case inert.
  it("warns about the bucket CORS prerequisite in the presign help", () => {
    expect(META.delivery_presign_enabled.help).toContain("CORS");
    expect(META.delivery_presign_enabled.help).toContain("origin");
  });

  // "purge that separately" promised an admin control that does not exist.
  // Purging is an automatic side effect (vidra-core media_purge.go: deletion,
  // a privacy flip away from public, an admin block — via the boot-configured
  // DELIVERY_CDN_PURGE_URL); anything else is the CDN provider's console.
  it("describes where edge purging actually happens instead of promising a control", () => {
    expect(META.delivery_cdn_enabled.help).not.toContain("purge that separately");
    expect(META.delivery_cdn_enabled.help).toContain("automatically");
    expect(META.delivery_cdn_enabled.help).toContain("CDN provider");
  });

  // qoe_collection_enabled is default-ON, so the help must state the
  // collection granularity the code actually has (vidra-core migration 0109 +
  // internal/qoe/digest.go): no account id, no IP, a day-scoped keyed viewer
  // digest, raw events pruned after 7 days.
  it("states the QoE collection granularity honestly", () => {
    const help = META.qoe_collection_enabled.help ?? "";
    expect(help).toContain("account");
    expect(help).toContain("IP address");
    expect(help).toContain("7 days");
  });

  // bootDep DISABLES a row (AdminInstanceConfigView locks it), and the failure
  // these toggles need flagged is "on but wired to nothing" — a state the
  // operator must stay able to flip back OFF. So they must never carry a
  // bootDep; the honest live signal is the non-disabling wiring warn below.
  it("keeps the delivery toggles bootDep-free — a wiring warn must never lock the row", () => {
    for (const key of DELIVERY_KEYS) {
      expect(META[key].bootDep, key).toBeUndefined();
      expect(bootDepNote(META[key], { features: {} }), key).toBeNull();
    }
  });

  // The live contradiction signal (admin-parity): GET /admin/infrastructure
  // reports the cdn feature's configured half and the storage backend, so the
  // config view can say "this switch currently does nothing" while it is ON.
  describe("wiring warnings from the infrastructure snapshot", () => {
    const wired: InfrastructureWiringInfo = {
      storage: { backend: "s3" },
      features: [{ key: "cdn", enabled: true, configured: true }],
    };
    const unwired: InfrastructureWiringInfo = {
      storage: { backend: "local" },
      features: [{ key: "cdn", enabled: true, configured: false }],
    };

    it("warns on the CDN toggle when the cdn feature is not configured", () => {
      const note = wiringWarnNote(META.delivery_cdn_enabled, unwired);
      expect(note).toContain("DELIVERY_CDN_BASE_URL");
      expect(note).toContain("does nothing");
      expect(wiringWarnNote(META.delivery_cdn_enabled, wired)).toBeNull();
    });

    it("warns on the presign toggle when the storage backend is not s3", () => {
      const note = wiringWarnNote(META.delivery_presign_enabled, unwired);
      expect(note).toContain("storage backend");
      expect(note).toContain("does nothing");
      expect(wiringWarnNote(META.delivery_presign_enabled, wired)).toBeNull();
    });

    // Graceful degradation is a hard requirement: no snapshot (fetch failed,
    // older backend, missing halves) renders exactly as today — no warn.
    it("stays silent without a snapshot or without the half it reads", () => {
      for (const key of ["delivery_cdn_enabled", "delivery_presign_enabled"]) {
        expect(wiringWarnNote(META[key], null), key).toBeNull();
        expect(wiringWarnNote(META[key], {}), key).toBeNull();
        expect(
          wiringWarnNote(META[key], { storage: {}, features: [] }),
          key,
        ).toBeNull();
      }
      // A key with no warn check never warns, whatever the snapshot says.
      expect(wiringWarnNote(META.qoe_collection_enabled, unwired)).toBeNull();
      expect(wiringWarnNote(undefined, unwired)).toBeNull();
    });

    // The admin-only fetch is spent only where a warn check can consume it.
    it("marks only the advanced page as needing the infrastructure snapshot", () => {
      expect(pageHasWiringChecks("advanced")).toBe(true);
      expect(pageHasWiringChecks("general")).toBe(false);
      expect(pageHasWiringChecks("vod")).toBe(false);
    });
  });
});

// instance_is_sensitive is a behavioural toggle, so its row must state the
// behaviour. Verified consumers (2026-08-28): vidra-core publishes it as the
// public /instance is_sensitive flag (internal/httpapi/instance.go) and the
// frontend About page renders a "dedicated to sensitive content" notice from
// it (InstanceAboutView) — and NOTHING else reads it, so the help must also
// say it hides no videos (that is sensitive_content_policy's job).
describe("GENERAL / moderation: instance_is_sensitive consequences", () => {
  it("states what the flag actually drives", () => {
    const help = META.instance_is_sensitive.help ?? "";
    expect(help).toContain("About page");
    expect(help.toLowerCase()).toContain("does not hide");
  });
});

// Guard against a future orphan key: a server key with no META entry renders
// with its raw snake_case name for a label and no help at all. The 1:1 test
// above is the structural guard; this one is the human one — the exception
// list is empty, so a key that ships unlabeled has to be added here on
// purpose rather than slipping in unnoticed.
describe("unlabeled server keys", () => {
  const KNOWN_UNLABELED: string[] = [];

  it("keeps the deliberately-unlabeled list empty", () => {
    expect(KNOWN_UNLABELED).toEqual([]);
    for (const [key] of SERVER_REGISTRY) {
      if (KNOWN_UNLABELED.includes(key)) continue;
      const label = META[key]?.label;
      expect(label, `${key} label`).toBeTruthy();
      // A label that is just the key humanized is the anti-pattern wearing a
      // META entry: it has to read as a sentence fragment, not a slug.
      expect(label, `${key} label is not the raw key`).not.toBe(key);
    }
  });

  // The five keys this slice curated. Each one gates production behaviour an
  // operator cannot infer from the label alone, so help is mandatory for them.
  it("gives every key added by the delivery/browse slice help text", () => {
    for (const key of [
      "browse_scroll_mode",
      "instance_custom_categories",
      "delivery_presign_enabled",
      "delivery_cdn_enabled",
      "qoe_collection_enabled",
    ]) {
      expect(META[key], key).toBeDefined();
      expect(META[key].help, `${key} help`).toBeTruthy();
    }
  });
});
