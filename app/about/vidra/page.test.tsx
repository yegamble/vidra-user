import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceConfig: vi.fn(),
  notFound: vi.fn(() => {
    // The real notFound() throws to unwind into the not-found boundary; throwing
    // here is what proves the page stops rather than falling through to render.
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: mocks.getInstanceConfig,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/InstanceAboutView", () => ({
  InstanceAboutView: () => null,
}));

import AboutVidraPage from "./page";

afterEach(() => vi.clearAllMocks());

describe("/about/vidra", () => {
  it("renders the software section on a normal instance", async () => {
    mocks.getInstanceConfig.mockResolvedValue({ branding: { hide_software_name: false } });
    const page = await AboutVidraPage();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(page.props.section).toBe("vidra");
  });

  it("renders when the backend is unreachable — a null snapshot is not evidence", async () => {
    mocks.getInstanceConfig.mockResolvedValue(null);
    expect((await AboutVidraPage()).props.section).toBe("vidra");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("404s while white-labelled — the URL itself names the software", async () => {
    mocks.getInstanceConfig.mockResolvedValue({ branding: { hide_software_name: true } });
    await expect(AboutVidraPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
