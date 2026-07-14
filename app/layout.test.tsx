import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: vi.fn().mockResolvedValue(null),
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("suppresses intentional hydration differences on both document elements", async () => {
    const html = await RootLayout({ children: null });
    const body = html.props.children;

    expect(html.type).toBe("html");
    expect(html.props.suppressHydrationWarning).toBe(true);
    expect(body.type).toBe("body");
    expect(body.props.suppressHydrationWarning).toBe(true);
  });
});
