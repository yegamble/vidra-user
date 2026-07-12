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
  placementFor,
  validateHexColor,
  validateTwitterHandle,
  zeroOrIntRange,
  type PlacedInstanceSetting,
} from "./admin-config-ia";

function setting(key: string, extra: Partial<PlacedInstanceSetting> = {}): PlacedInstanceSetting {
  return { key, type: "string", value: "", default: "", overridden: false, ...extra };
}

describe("config pages", () => {
  it("exposes the seven-page IA in order", () => {
    expect(CONFIG_PAGES.map((p) => p.id)).toEqual([
      "general",
      "vod",
      "live",
      "federation",
      "customization",
      "homepage",
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
    expect(placementFor("live_enabled")).toEqual({ page: "live", section: "live" });
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
      placementFor("storyboards_enabled", { page: "vod", section: "transcoding" }),
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
    expect(model).toHaveLength(1);
    expect(model[0].section.id).toBe("live");
    expect(model[0].keys).toEqual(["live_enabled"]);
  });

  it("puts unknown keys with server metadata under the named section", () => {
    const model = buildPageModel("vod", [
      setting("storyboards_enabled", { type: "bool", value: false, default: false, page: "vod", section: "transcoding" }),
    ]);
    const transcoding = model.find((s) => s.section.id === "transcoding");
    expect(transcoding?.section.title).toBe("Transcoding");
    expect(transcoding?.keys).toEqual(["storyboards_enabled"]);
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
