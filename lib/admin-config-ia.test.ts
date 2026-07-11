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
