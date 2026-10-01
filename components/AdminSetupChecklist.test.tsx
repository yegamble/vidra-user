// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getInstance: vi.fn(), getInstanceSettings: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getInstance: mocks.getInstance, getInstanceSettings: mocks.getInstanceSettings },
  };
});

import { AdminSetupChecklist } from "./AdminSetupChecklist";

const slot = (is_fallback: boolean) => ({ url: "/x", is_fallback });
const branding = (avatar = true, banner = true) => ({
  avatar: slot(avatar),
  banner: slot(banner),
  logos: { favicon: slot(true), header_wide: slot(true), header_square: slot(true), opengraph: slot(true) },
});
const settings = (name = "Vidra", regOverridden = false) => ({
  settings: [
    { key: "instance_name", type: "string", value: name, default: "Vidra", overridden: name !== "Vidra" },
    { key: "registration_enabled", type: "bool", value: true, default: true, overridden: regOverridden },
  ],
});
const REGION = { name: "Finish setting up" }; // state is asserted from "Done"/"To do" text
const row = (name: string) => screen.getByRole("listitem", { name }).textContent ?? "";
const link = (name: string) => screen.getByRole("listitem", { name }).querySelector("a")?.getAttribute("href");

async function expectHidden() {
  render(<AdminSetupChecklist />);
  await waitFor(() => expect(mocks.getInstanceSettings).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByRole("region", REGION)).toBeNull();
}

beforeEach(() => {
  localStorage.clear();
  mocks.getInstance.mockResolvedValue({ features: { mail: false }, branding: branding() });
  mocks.getInstanceSettings.mockResolvedValue(settings());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminSetupChecklist", () => {
  it("renders every item as to do, linking to the page that changes it", async () => {
    render(<AdminSetupChecklist />);
    await screen.findByRole("region", REGION);
    for (const n of ["Name your instance", "Set up email", "Decide who can sign up", "Add branding"]) {
      expect(row(n)).toContain("To do");
    }
    expect(row("Plan storage and backups")).not.toMatch(/To do|Done/);
    expect(link("Set up email")).toBe("/admin/config/email");
    expect(link("Plan storage and backups")).toBe("https://vidra.yosef.app/docs/");
  });

  it("marks items done from the contract data", async () => {
    mocks.getInstance.mockResolvedValue({ features: { mail: true }, branding: branding(false) });
    mocks.getInstanceSettings.mockResolvedValue(settings("My Tube"));
    render(<AdminSetupChecklist />);
    await screen.findByRole("region", REGION);
    for (const n of ["Name your instance", "Set up email", "Add branding"]) expect(row(n)).toContain("Done");
    expect(row("Decide who can sign up")).toContain("To do");
  });

  it("dismiss hides the card and persists across remounts", async () => {
    const { unmount } = render(<AdminSetupChecklist />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss setup checklist" }));
    expect(screen.queryByRole("region", REGION)).toBeNull();
    unmount();
    await expectHidden();
  });

  it("survives blocked storage", async () => {
    for (const m of ["getItem", "setItem"] as const) {
      vi.spyOn(Storage.prototype, m).mockImplementation(() => {
        throw new Error("blocked");
      });
    }
    render(<AdminSetupChecklist />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss setup checklist" }));
    expect(screen.queryByRole("region", REGION)).toBeNull();
  });

  it("hides itself when every derivable item is done", async () => {
    mocks.getInstance.mockResolvedValue({ features: { mail: true }, branding: branding(true, false) });
    mocks.getInstanceSettings.mockResolvedValue(settings("My Tube", true));
    await expectHidden();
  });

  it("hides when an older backend omits every field (nothing derivable)", async () => {
    mocks.getInstance.mockResolvedValue({ name: "Vidra" });
    mocks.getInstanceSettings.mockResolvedValue({ settings: [] });
    await expectHidden();
  });

  it("keeps the derivable items when one read fails", async () => {
    mocks.getInstanceSettings.mockRejectedValue(new Error("boom"));
    render(<AdminSetupChecklist />);
    await screen.findByRole("region", REGION);
    expect(row("Set up email")).toContain("To do");
    expect(row("Name your instance")).not.toMatch(/To do|Done/);
  });
});
