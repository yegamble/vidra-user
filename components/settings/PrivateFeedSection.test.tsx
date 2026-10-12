// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sessionStatus = "authed";
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: sessionStatus }) }));
vi.mock("@/lib/api", () => ({
  api: { getFeedToken: vi.fn(), rotateFeedToken: vi.fn(), revokeFeedToken: vi.fn() },
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { api } from "@/lib/api";
import { PrivateFeedSection } from "./PrivateFeedSection";

const getFeedToken = vi.mocked(api.getFeedToken);
const rotateFeedToken = vi.mocked(api.rotateFeedToken);
const revokeFeedToken = vi.mocked(api.revokeFeedToken);

beforeEach(() => {
  sessionStatus = "authed";
  getFeedToken.mockResolvedValue({ configured: false });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PrivateFeedSection", () => {
  it("renders nothing for a signed-out visitor", () => {
    sessionStatus = "anon";
    const { container } = render(<PrivateFeedSection />);
    expect(container.innerHTML).toBe("");
    expect(getFeedToken).not.toHaveBeenCalled();
  });

  it("generates a URL, shows it once, copies it, and can turn it off", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    rotateFeedToken.mockResolvedValue({
      token: "t0k",
      url: "https://v.example/feeds/subscriptions.xml?token=t0k",
      created_at: "2026-10-12T00:00:00Z",
    });
    revokeFeedToken.mockResolvedValue(undefined);
    render(<PrivateFeedSection />);

    fireEvent.click(await screen.findByRole("button", { name: /Generate URL/ }));
    const field = (await screen.findByLabelText("Private feed URL")) as HTMLInputElement;
    expect(field.value).toContain("token=t0k");
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
    expect(screen.getByRole("button", { name: /Rotate URL/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(screen.queryByLabelText("Private feed URL")).toBeNull());
    expect(revokeFeedToken).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Generate URL/ })).toBeTruthy();
  });

  it("explains that an existing URL cannot be shown again", async () => {
    getFeedToken.mockResolvedValue({ configured: true, created_at: "2026-10-01T00:00:00Z" });
    render(<PrivateFeedSection />);
    expect(await screen.findByText(/can.t be shown again/)).toBeTruthy();
    expect(screen.queryByLabelText("Private feed URL")).toBeNull();
  });
});
