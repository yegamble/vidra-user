import { describe, expect, it, vi } from "vitest";

import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

const mocks = vi.hoisted(() => ({ getInstanceConfig: vi.fn() }));

vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: mocks.getInstanceConfig,
  INSTANCE_CONFIG_REVALIDATE_SECONDS: 60,
}));

import RootLayout, { dynamic } from "./layout";
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

async function renderWith(instance: InstanceConfigSnapshot | null) {
  mocks.getInstanceConfig.mockResolvedValue(instance);
  return RootLayout({ children: null });
}

describe("RootLayout", () => {
  it("suppresses intentional hydration differences on both document elements", async () => {
    const html = await renderWith(null);
    const body = html.props.children;

    expect(html.type).toBe("html");
    expect(html.props.suppressHydrationWarning).toBe(true);
    expect(body.type).toBe("body");
    expect(body.props.suppressHydrationWarning).toBe(true);
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
