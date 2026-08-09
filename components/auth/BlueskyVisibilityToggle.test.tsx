// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateProfile = vi.fn(() => Promise.resolve());
let sessionUser: Record<string, unknown> | null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: sessionUser, updateProfile }),
}));

const listOAuthIdentities = vi.fn();
vi.mock("@/lib/api", () => ({
  authApi: { listOAuthIdentities: (...args: unknown[]) => listOAuthIdentities(...args) },
  ApiError: class ApiError extends Error {},
  errorMessage: () => "Something went wrong.",
}));

import { BlueskyVisibilityToggle } from "./BlueskyVisibilityToggle";

const LABEL = "Show my Bluesky handle on my public profile";

beforeEach(() => {
  sessionUser = { id: "u1", show_bluesky: false };
  listOAuthIdentities.mockResolvedValue({
    identities: [
      { provider: "atproto", email: "", handle: "ada.bsky.social", created_at: "2026-07-01" },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlueskyVisibilityToggle", () => {
  it("renders nothing when no Bluesky account is linked", async () => {
    listOAuthIdentities.mockResolvedValue({
      identities: [{ provider: "google", email: "a@b.c", created_at: "2026-07-01" }],
    });
    const { container } = render(<BlueskyVisibilityToggle />);
    await waitFor(() => expect(listOAuthIdentities).toHaveBeenCalled());
    expect(container.querySelector("#settings-show-bluesky")).toBeNull();
  });

  it("shows the linked handle and persists show_bluesky on toggle", async () => {
    render(<BlueskyVisibilityToggle />);
    const checkbox = (await screen.findByLabelText(LABEL)) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText("@ada.bsky.social")).toBeTruthy();

    fireEvent.click(checkbox);
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ show_bluesky: true }));
  });

  it("reflects an already-enabled stored value", async () => {
    sessionUser = { id: "u1", show_bluesky: true };
    render(<BlueskyVisibilityToggle />);
    const checkbox = (await screen.findByLabelText(LABEL)) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
