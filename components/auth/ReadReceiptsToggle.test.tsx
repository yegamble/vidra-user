// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMessagingPrefs = vi.fn();
const updateMessagingPrefs = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    getMessagingPrefs: (...args: unknown[]) => getMessagingPrefs(...args),
    updateMessagingPrefs: (...args: unknown[]) => updateMessagingPrefs(...args),
  },
  errorMessage: () => "Something went wrong.",
  // Pulled in by the shared instance-features store behind the messaging gate.
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { ReadReceiptsToggle } from "./ReadReceiptsToggle";

const LABEL = "Show others when I’ve read their messages";

function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
}

beforeEach(() => {
  getMessagingPrefs.mockResolvedValue({ read_receipts: true });
  updateMessagingPrefs.mockImplementation((body: { read_receipts: boolean }) =>
    Promise.resolve({ read_receipts: body.read_receipts }),
  );
});

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
  vi.clearAllMocks();
});

describe("ReadReceiptsToggle", () => {
  it("reflects the stored preference (core defaults it on)", async () => {
    render(<ReadReceiptsToggle />);
    const checkbox = (await screen.findByLabelText(LABEL)) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("round-trips the opt-out through PATCH /me/messaging-prefs", async () => {
    getMessagingPrefs.mockResolvedValue({ read_receipts: true });
    render(<ReadReceiptsToggle />);
    const checkbox = (await screen.findByLabelText(LABEL)) as HTMLInputElement;

    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(updateMessagingPrefs).toHaveBeenCalledWith({ read_receipts: false }),
    );
    await waitFor(() => expect(checkbox.checked).toBe(false));

    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(updateMessagingPrefs).toHaveBeenCalledWith({ read_receipts: true }),
    );
    await waitFor(() => expect(checkbox.checked).toBe(true));
  });

  it("reverts the optimistic flip when the PATCH fails", async () => {
    updateMessagingPrefs.mockRejectedValue(new Error("nope"));
    render(<ReadReceiptsToggle />);
    const checkbox = (await screen.findByLabelText(LABEL)) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // The peer would still be told when we read their DMs, so the switch must
    // not lie about having stopped that.
    expect(checkbox.checked).toBe(true);
  });

  it("offers a retry instead of vanishing when the preference cannot be loaded", async () => {
    getMessagingPrefs.mockRejectedValueOnce(new Error("boom"));
    render(<ReadReceiptsToggle />);
    const retry = await screen.findByRole("button", { name: "Retry" });

    fireEvent.click(retry);
    const checkbox = (await screen.findByLabelText(LABEL)) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  // With messaging gated off, GET /me/messaging-prefs answers 403, so this
  // control could only ever render its own error-and-retry. There is no
  // preference to express: the setting goes, and nothing is fetched for it.
  it("is absent, and fetches nothing, when the instance discloses messaging: false", () => {
    setInstanceFeaturesForTests(features({ messaging: false }));
    const { container } = render(<ReadReceiptsToggle />);
    expect(container.textContent).toBe("");
    expect(getMessagingPrefs).not.toHaveBeenCalled();
  });

  // Counter-test: an instance that never turned messaging off still gets it.
  it("still renders when the field is absent (a core that predates the disclosure)", async () => {
    setInstanceFeaturesForTests(features());
    render(<ReadReceiptsToggle />);
    expect(await screen.findByLabelText(LABEL)).toBeTruthy();
  });
});
