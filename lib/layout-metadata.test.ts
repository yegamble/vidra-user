import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { InstanceConfigSnapshot } from "./instance-config.server";
import {
  APPLE_TOUCH_ICON,
  FALLBACK_DESCRIPTION,
  FALLBACK_ICON,
  buildNotFoundMetadata,
  buildRootMetadata,
  buildWebManifest,
} from "./layout-metadata";
import { NEUTRAL_DESCRIPTION, NEUTRAL_SITE_TITLE, SOFTWARE_NAME } from "./software-brand";

// Config-parity W4: the metadata builder consumes the SSR instance snapshot —
// title/description from the instance identity, favicon + og:image from the
// branding logo slots (only when NOT is_fallback), twitter:site from
// social.twitter_username. Precedence rule: a null snapshot / absent block /
// fallback slot always degrades to the built-in Vidra icon (and no social-card
// entries at all). apiBaseUrl in tests is the default
// http://localhost:8080 (lib/config).

const API = "http://localhost:8080";

function snapshot(overrides: Record<string, unknown> = {}): InstanceConfigSnapshot {
  return { name: "ExampleTube", short_description: "Videos, federated.", ...overrides } as InstanceConfigSnapshot;
}

const set = (url: string) => ({ url, is_fallback: false });
const unset = { url: "", is_fallback: true };

describe("buildRootMetadata", () => {
  it("returns the hardcoded fallbacks when the backend is unreachable", () => {
    expect(buildRootMetadata(null)).toEqual({
      title: SOFTWARE_NAME,
      description: FALLBACK_DESCRIPTION,
      icons: { icon: FALLBACK_ICON, apple: APPLE_TOUCH_ICON },
    });
  });

  it("titles from the instance name and short description when present", () => {
    const meta = buildRootMetadata(snapshot());
    expect(meta.title).toBe("ExampleTube");
    expect(meta.description).toBe("Videos, federated.");
  });

  it("falls back per-field when the identity values are blank", () => {
    const meta = buildRootMetadata(snapshot({ name: "  ", short_description: "" }));
    expect(meta.title).toBe(SOFTWARE_NAME);
    expect(meta.description).toBe(FALLBACK_DESCRIPTION);
  });

  it("uses the built-in icon and no social entries when branding is absent", () => {
    const meta = buildRootMetadata(snapshot());
    expect(meta.icons).toEqual({ icon: FALLBACK_ICON, apple: APPLE_TOUCH_ICON });
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });

  it("uses the built-in icon and no social entries while every slot is fallback", () => {
    const meta = buildRootMetadata(
      snapshot({
        branding: { logos: { favicon: unset, opengraph: unset } },
        social: { twitter_username: "" },
      }),
    );
    expect(meta.icons).toEqual({ icon: FALLBACK_ICON, apple: APPLE_TOUCH_ICON });
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });

  it("wires a SET favicon slot into icons, resolved against the API origin", () => {
    const meta = buildRootMetadata(
      snapshot({ branding: { logos: { favicon: set("/api/v1/instance/logo/favicon") } } }),
    );
    expect(meta.icons).toEqual({
      icon: `${API}/api/v1/instance/logo/favicon`,
      apple: APPLE_TOUCH_ICON,
    });
  });

  it("always wires the product apple-touch icon, independent of the operator favicon", () => {
    expect(buildRootMetadata(snapshot()).icons).toMatchObject({ apple: APPLE_TOUCH_ICON });
    expect(
      buildRootMetadata(
        snapshot({ branding: { logos: { favicon: set("/api/v1/instance/logo/favicon") } } }),
      ).icons,
    ).toMatchObject({ apple: APPLE_TOUCH_ICON });
  });

  it("wires a SET opengraph slot into og:image and twitter:image", () => {
    const meta = buildRootMetadata(
      snapshot({ branding: { logos: { opengraph: set("/api/v1/instance/logo/opengraph") } } }),
    );
    expect(meta.openGraph).toEqual({
      title: "ExampleTube",
      description: "Videos, federated.",
      siteName: "ExampleTube",
      images: [{ url: `${API}/api/v1/instance/logo/opengraph` }],
    });
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      images: [`${API}/api/v1/instance/logo/opengraph`],
    });
  });

  it("emits twitter:site (normalized to @handle) when the operator set a username", () => {
    const meta = buildRootMetadata(snapshot({ social: { twitter_username: "exampletube" } }));
    expect(meta.twitter).toEqual({ card: "summary", site: "@exampletube" });
    expect(meta.openGraph).toBeUndefined();
  });

  it("combines the full social card: og image + twitter:site on one snapshot", () => {
    const meta = buildRootMetadata(
      snapshot({
        branding: { logos: { opengraph: set("/api/v1/instance/logo/opengraph") } },
        social: { twitter_username: "@exampletube" },
      }),
    );
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      site: "@exampletube",
      images: [`${API}/api/v1/instance/logo/opengraph`],
    });
  });
});

describe("favicon metadata precedence", () => {
  it("keeps higher-priority App Router icon files out of the root segment", () => {
    const rootFiles = readdirSync(new URL("../app/", import.meta.url));
    const metadataIcons = rootFiles.filter((file) =>
      /^(?:favicon\.ico|icon\d*\.(?:ico|jpe?g|png|svg|js|jsx|ts|tsx))$/i.test(file),
    );

    expect(metadataIcons).toEqual([]);
  });
});

// --- White-label (branding.hide_software_name) ----------------------------
//
// Hidden is the case a crawler, a browser tab, and an installed PWA can all
// leak: every one of these slots falls back to a literal "Vidra" today. Each
// assertion below pins BOTH states, because the not-hidden half is the
// regression that matters for every instance that never touches the setting.

const hidden = (overrides: Record<string, unknown> = {}) =>
  snapshot({
    branding: { hide_software_name: true, ...(overrides.branding as object) },
    ...overrides,
  }) as InstanceConfigSnapshot;

const neutralAppIcons = [
  { src: "/neutral-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/neutral-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/neutral-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

describe("buildRootMetadata while white-labelled", () => {
  it("replaces product icons with neutral icons when no operator image is set", () => {
    expect(buildRootMetadata(hidden()).icons).toEqual({
      icon: "/neutral-icon.svg", apple: "/neutral-apple-touch-icon.png",
    });
    expect(buildWebManifest(hidden()).icons).toEqual(neutralAppIcons);
  });

  it("retains operator icons for the tab, Apple touch and installed app", () => {
    const instance = snapshot({ branding: { hide_software_name: true, logos: {
      favicon: set("/api/v1/instance/logo/favicon"),
      header_square: set("/api/v1/instance/logo/header-square"),
    } } });
    expect(buildRootMetadata(instance).icons).toEqual({
      icon: `${API}/api/v1/instance/logo/favicon`,
      apple: `${API}/api/v1/instance/logo/header-square`,
    });
    expect(buildWebManifest(instance).icons).toEqual([
      { src: `${API}/api/v1/instance/logo/header-square`, purpose: "any" },
      ...neutralAppIcons,
    ]);
  });

  it("keeps raster and maskable fallbacks when the only operator image is a small favicon", () => {
    const instance = snapshot({ branding: { hide_software_name: true, logos: {
      favicon: set("https://example.test/favicon-16.png"),
    } } });
    expect(buildWebManifest(instance).icons).toEqual([
      { src: "https://example.test/favicon-16.png", purpose: "any" },
      ...neutralAppIcons,
    ]);
  });

  it("keeps product icons when the operator explicitly shows the software", () => {
    const instance = snapshot({ branding: { hide_software_name: false } });
    expect(buildRootMetadata(instance).icons).toEqual({ icon: FALLBACK_ICON, apple: APPLE_TOUCH_ICON });
    expect(buildWebManifest(instance).icons?.map((icon) => icon.src)).toEqual([
      "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
    ]);
  });

  it("titles from the instance name and keeps the software name out of the description", () => {
    const meta = buildRootMetadata(hidden());
    expect(meta.title).toBe("ExampleTube");
    expect(meta.description).toBe("Videos, federated.");
  });

  it("falls back to a neutral title and description, never the software name", () => {
    const meta = buildRootMetadata(hidden({ name: "", short_description: "" }));
    expect(meta.title).toBe(NEUTRAL_SITE_TITLE);
    expect(meta.description).toBe(NEUTRAL_DESCRIPTION);
    expect(JSON.stringify(meta)).not.toMatch(/vidra/i);
    // The PeerTube sentence names another product as well as this one.
    expect(meta.description).not.toBe(FALLBACK_DESCRIPTION);
  });

  it("still emits the hardcoded fallbacks when the flag is absent or false", () => {
    expect(buildRootMetadata(snapshot({ name: "", short_description: "" })).title).toBe(
      SOFTWARE_NAME,
    );
    expect(
      buildRootMetadata(
        snapshot({ name: "", short_description: "", branding: { hide_software_name: false } }),
      ).description,
    ).toBe(FALLBACK_DESCRIPTION);
  });
});

describe("buildWebManifest", () => {
  it("names the PWA after the software when the backend is unreachable", () => {
    const manifest = buildWebManifest(null);
    expect(manifest.name).toBe(SOFTWARE_NAME);
    expect(manifest.short_name).toBe(SOFTWARE_NAME);
    expect(manifest.description).toBe(FALLBACK_DESCRIPTION);
    // The installability floor (Wave F) is unchanged by the naming seam.
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toHaveLength(3);
  });

  it("names the PWA after the instance once the snapshot carries a name", () => {
    const manifest = buildWebManifest(snapshot());
    expect(manifest.name).toBe("ExampleTube");
    expect(manifest.short_name).toBe("ExampleTube");
    expect(manifest.description).toBe("Videos, federated.");
  });

  it("never emits the software name while white-labelled, even with no instance name", () => {
    const manifest = buildWebManifest(hidden({ name: "", short_description: "" }));
    expect(manifest.name).toBe(NEUTRAL_SITE_TITLE);
    expect(manifest.short_name).toBe(NEUTRAL_SITE_TITLE);
    expect(manifest.description).toBe(NEUTRAL_DESCRIPTION);
    expect(JSON.stringify(manifest)).not.toMatch(/vidra/i);
  });
});

describe("buildNotFoundMetadata", () => {
  it("suffixes the software name when the backend is unreachable", () => {
    expect(buildNotFoundMetadata(null)).toEqual({ title: `Page not found — ${SOFTWARE_NAME}` });
  });

  it("suffixes the instance name when it has one", () => {
    expect(buildNotFoundMetadata(snapshot())).toEqual({ title: "Page not found — ExampleTube" });
    expect(buildNotFoundMetadata(hidden())).toEqual({ title: "Page not found — ExampleTube" });
  });

  it("drops the suffix entirely while white-labelled with no instance name", () => {
    expect(buildNotFoundMetadata(hidden({ name: "" }))).toEqual({ title: "Page not found" });
  });
});
