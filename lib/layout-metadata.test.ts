import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { InstanceConfigSnapshot } from "./instance-config.server";
import {
  FALLBACK_DESCRIPTION,
  FALLBACK_ICON,
  FALLBACK_TITLE,
  buildRootMetadata,
} from "./layout-metadata";

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
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      icons: { icon: FALLBACK_ICON },
    });
  });

  it("titles from the instance name and short description when present", () => {
    const meta = buildRootMetadata(snapshot());
    expect(meta.title).toBe("ExampleTube");
    expect(meta.description).toBe("Videos, federated.");
  });

  it("falls back per-field when the identity values are blank", () => {
    const meta = buildRootMetadata(snapshot({ name: "  ", short_description: "" }));
    expect(meta.title).toBe(FALLBACK_TITLE);
    expect(meta.description).toBe(FALLBACK_DESCRIPTION);
  });

  it("uses the built-in icon and no social entries when branding is absent", () => {
    const meta = buildRootMetadata(snapshot());
    expect(meta.icons).toEqual({ icon: FALLBACK_ICON });
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
    expect(meta.icons).toEqual({ icon: FALLBACK_ICON });
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });

  it("wires a SET favicon slot into icons, resolved against the API origin", () => {
    const meta = buildRootMetadata(
      snapshot({ branding: { logos: { favicon: set("/api/v1/instance/logo/favicon") } } }),
    );
    expect(meta.icons).toEqual({ icon: `${API}/api/v1/instance/logo/favicon` });
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
