// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendTestMail: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, sendTestMail: mocks.sendTestMail },
  };
});

import { EmailConfigPanel } from "./AdminEmailConfigView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminEmailConfigView", () => {
  it("names the port-blocking trap and the records that must be published", () => {
    render(<EmailConfigPanel />);
    const note = screen.getByRole("note");
    // The three blocked ports and the 443 alternative — the failure an
    // operator cannot diagnose from a correct-looking SMTP form.
    expect(note.textContent).toMatch(/25, 465 and 587/);
    expect(note.textContent).toMatch(/443/);
    expect(note.textContent).toMatch(/SPF and DKIM/);
  });

  it("sends presentation settings to Customization rather than repeating them", () => {
    render(<EmailConfigPanel />);
    const link = screen.getByRole("link", { name: "Customization → Email" });
    expect(link.getAttribute("href")).toBe(
      "/admin/config/customization#config-section-email",
    );
  });

  it("mounts the shared mail test, not a second copy of it", () => {
    render(<EmailConfigPanel />);
    expect(screen.getByRole("region", { name: "Outbound mail test" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send test message" })).toBeTruthy();
    // Rendering the page must not probe the relay — the test is a deliberate act.
    expect(mocks.sendTestMail).not.toHaveBeenCalled();
  });
});
