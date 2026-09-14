// @vitest-environment jsdom
//
// The About pages are the product's most explicit software-attribution surface:
// a dedicated "Vidra" tab, a "This platform is powered by Vidra" hero, the
// Software row on the Technical tab, and four sentences of Network copy naming
// the product. branding.hide_software_name removes or neutralizes all of them.
//
// The view answers from the instance document IT renders (the client-side cached
// /instance read), not from the SoftwareBrandProvider context — which is also
// what lets the mocked Playwright suite drive this state through page.route.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({
  getInstanceCached: vi.fn(),
  getInstanceAbout: vi.fn(),
  getVideoConfigCached: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    getInstanceCached: mocks.getInstanceCached,
    getInstanceAbout: mocks.getInstanceAbout,
    getVideoConfigCached: mocks.getVideoConfigCached,
  };
});

import { InstanceAboutView } from "./InstanceAboutView";

const about = {
  description: "",
  terms: "",
  code_of_conduct: "",
  moderation_info: "",
  administrator_info: "",
  creation_reason: "",
  maintenance_lifetime: "",
  business_model: "",
  hardware_info: "",
  support_text: "",
};

function instance(hideSoftwareName: boolean) {
  return {
    name: "A17 Lab Tube",
    short_description: "A community video home.",
    description: "",
    social_links: {},
    software: { name: "vidra", version: "0.1.0" },
    features: { uploads: true, imports: true, live: false, comments: true },
    federation_enabled: true,
    registration_enabled: true,
    registration_requires_approval: false,
    categories: [],
    moderator_languages: [],
    branding: { logos: {}, hide_instance_name: false, hide_software_name: hideSoftwareName },
  };
}

beforeEach(() => {
  mocks.getInstanceAbout.mockResolvedValue(about);
  mocks.getVideoConfigCached.mockResolvedValue({ categories: [], languages: [], licenses: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function show(section: "vidra" | "technical" | "network", hidden: boolean) {
  mocks.getInstanceCached.mockResolvedValue(instance(hidden));
  render(<InstanceAboutView section={section} />);
  // The identity hero is the settled-snapshot milestone (the skeleton renders
  // until BOTH the instance and the about document land).
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "A17 Lab Tube" })).toBeTruthy(),
  );
}

describe("About tabs", () => {
  it("offers the software tab while the software name is shown", async () => {
    await show("vidra", false);
    const nav = screen.getByRole("navigation", { name: "About categories" });
    expect(nav.textContent).toContain("Vidra");
    expect(screen.getByRole("heading", { name: "This platform is powered by Vidra" })).toBeTruthy();
  });

  it("drops the software tab AND its section when hidden", async () => {
    await show("vidra", true);
    const nav = screen.getByRole("navigation", { name: "About categories" });
    expect(nav.textContent).not.toMatch(/vidra/i);
    expect(screen.queryByRole("link", { name: "Vidra" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /powered by/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });
});

describe("About → Technical", () => {
  it("reports the software name and version by default", async () => {
    await show("technical", false);
    expect(screen.getByText("vidra 0.1.0")).toBeTruthy();
    expect(screen.getByText("Software")).toBeTruthy();
  });

  it("omits the whole Software row when hidden (the version identifies it too)", async () => {
    await show("technical", true);
    expect(screen.queryByText("Software")).toBeNull();
    expect(screen.queryByText(/vidra/i)).toBeNull();
    // The rest of the Technical table is untouched.
    expect(screen.getByText("Video uploads")).toBeTruthy();
    expect(screen.getByText("ActivityPub enabled")).toBeTruthy();
  });
});

describe("About → Network", () => {
  it("names the software in the federation prose by default", async () => {
    await show("network", false);
    expect(
      screen.getByText(/Vidra speaks three open protocols/, { exact: false }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Vidra federates individual channels/, { exact: false }),
    ).toBeTruthy();
  });

  it("neutralizes the prose when hidden but keeps the protocol names", async () => {
    await show("network", true);
    expect(
      screen.getByText(/This platform speaks three open protocols/, { exact: false }),
    ).toBeTruthy();
    expect(
      screen.getByText(/This platform federates individual channels/, { exact: false }),
    ).toBeTruthy();
    // The NETWORKS are not this product and must still be named (ActivityPub
    // appears twice: the protocol card and the federation-behaviour card).
    expect(screen.getAllByText("ActivityPub", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByText("Bluesky", { exact: true })).toBeTruthy();
    expect(screen.getByText("IPFS", { exact: true })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });
});
