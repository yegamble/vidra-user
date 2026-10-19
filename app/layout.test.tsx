import { describe, expect, it, vi } from "vitest";

import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

const mocks = vi.hoisted(() => ({ getInstanceConfig: vi.fn(), localeCookie: undefined as string | undefined }));

vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: mocks.getInstanceConfig,
  INSTANCE_CONFIG_REVALIDATE_SECONDS: 60,
}));
// proxy.ts sets x-nonce per request; the enforced CSP blocks scripts without it.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nonce": "n0nce" }),
  cookies: async () => ({
    get: (name: string) =>
      name === "vidra_locale" && mocks.localeCookie ? { name, value: mocks.localeCookie } : undefined,
  }),
}));

import RootLayout, { dynamic } from "./layout";
import Script from "next/script";

import { I18nProvider } from "@/components/I18nProvider";
import { InstanceAdsProvider } from "@/components/InstanceAdsProvider";
import { InstanceBanner } from "@/components/InstanceBanner";
import { InstanceCustomization } from "@/components/InstanceCustomization";
import { SoftwareBrandProvider } from "@/components/SoftwareBrandProvider";

/**
 * Walk the rendered element tree for the first element of a given type. The
 * layout is a plain async server component, so awaiting it yields React
 * elements we can inspect directly — no DOM, no renderer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking an untyped element tree
function findElement(node: any, type: unknown): any {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (node.type === type) return node;
  return findElement(node.props?.children, type);
}

async function renderWith(instance: InstanceConfigSnapshot | null, localeCookie?: string) {
  mocks.getInstanceConfig.mockResolvedValue(instance);
  mocks.localeCookie = localeCookie;
  return RootLayout({ children: null });
}

describe("RootLayout", () => {
  it("seeds ads before descendants render, distinguishing failure from an older backend", async () => {
    const ads = { enabled: true, vast_tag_url: "https://ads.example/pre.xml" };
    const known = findElement(await renderWith({ ads } as InstanceConfigSnapshot), InstanceAdsProvider);
    expect(known, "all watch and embed routes must receive the SSR ad snapshot").not.toBeNull();
    expect(known.props.ads).toBe(ads);
    expect(findElement(await renderWith(null), InstanceAdsProvider).props.ads).toBeUndefined();
    expect(findElement(await renderWith({} as InstanceConfigSnapshot), InstanceAdsProvider).props.ads).toBeNull();
  });

  it("suppresses intentional hydration differences on both document elements", async () => {
    const html = await renderWith(null);
    const body = html.props.children;

    expect(html.type).toBe("html");
    expect(html.props.suppressHydrationWarning).toBe(true);
    expect(body.type).toBe("body");
    expect(body.props.suppressHydrationWarning).toBe(true);
  });

  it("threads the request nonce to every script the layout emits", async () => {
    const html = await renderWith(null);
    expect(findElement(html, Script).props.nonce).toBe("n0nce");
    expect(findElement(html, "script").props.nonce).toBe("n0nce");
    expect(findElement(html, InstanceCustomization).props.nonce).toBe("n0nce");
    expect(findElement(html, InstanceBanner).props.nonce).toBe("n0nce");
  });

  it("places announcements above page content inside the column beside the sidebar", async () => {
    const page = <main>Page content</main>;
    const html = await RootLayout({ children: page });
    const [, content] = findElement(html, "div").props.children;
    expect(content.props.id).toBe("main-content");
    expect(content.props.children).toHaveLength(2);
    expect(content.props.children[0].type).toBe(InstanceBanner);
    expect(content.props.children[1]).toBe(page);
  });
});

// The white-label seam has exactly ONE wiring point, and everything downstream
// (every client consumer's hook) is only as correct as this prop. Nothing else
// tests it: the consumers' own suites inject the provider directly, so a layout
// that passed a hardcoded value — or read the wrong field — would leave all of
// them green while the feature did nothing in production.
describe("RootLayout white-label wiring", () => {
  const providerFor = async (instance: InstanceConfigSnapshot | null) =>
    findElement(await renderWith(instance), SoftwareBrandProvider);

  it("passes hidden=true straight through from the instance snapshot", async () => {
    const provider = await providerFor({
      branding: { hide_software_name: true },
    } as InstanceConfigSnapshot);
    expect(provider, "the layout must render a SoftwareBrandProvider").not.toBeNull();
    expect(provider.props.hidden).toBe(true);
  });

  it("passes hidden=false when the backend is unreachable (null snapshot)", async () => {
    // The load-bearing default: no backend must behave exactly like today.
    const provider = await providerFor(null);
    expect(provider.props.hidden).toBe(false);
  });

  it("passes hidden=false on an explicit false and on an absent block", async () => {
    expect(
      (await providerFor({ branding: { hide_software_name: false } } as InstanceConfigSnapshot))
        .props.hidden,
    ).toBe(false);
    expect((await providerFor({} as InstanceConfigSnapshot)).props.hidden).toBe(false);
  });

  it("renders every page per request, so no build-time prerender bakes the fallback", async () => {
    // `next build` has no backend, so a prerendered page would bake the null
    // snapshot's fallback identity into HTML and serve it once per path after
    // every deploy (measured: 55 of 56 prerendered documents carried the
    // software name). force-dynamic is what keeps that from happening.
    expect(dynamic).toBe("force-dynamic");
  });
});

// The document language is resolved per request (lib/i18n/locale.server.ts) and
// stamped on <html> — screen readers pick their voice from it, and `dir` flips
// the whole layout for right-to-left scripts.
describe("RootLayout locale wiring", () => {
  it("is lang=en dir=ltr with no locale signal, and hands en to the client provider", async () => {
    const html = await renderWith(null);
    expect(html.props.lang).toBe("en");
    expect(html.props.dir).toBe("ltr");
    const provider = findElement(html, I18nProvider);
    expect(provider, "the layout must render an I18nProvider").not.toBeNull();
    expect(provider.props.locale).toBe("en");
    expect(provider.props.messages).toEqual({});
  });

  it("follows the vidra_locale cookie for lang, the provider and the server-rendered skip link", async () => {
    const html = await renderWith(null, "fr");
    expect(html.props.lang).toBe("fr");
    const provider = findElement(html, I18nProvider);
    expect(provider.props.locale).toBe("fr");
    expect(provider.props.messages["a11y.skipToContent"]).toBe("Aller au contenu");
    expect(findElement(html, "a").props.children).toBe("Aller au contenu");
  });
});
