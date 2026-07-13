// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const updateProfile = vi.fn(() => Promise.resolve());
let sessionUser: Record<string, unknown> | null;
let sessionStatus: string;
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, user: sessionUser, updateProfile }),
}));

vi.mock("@/lib/api", () => {
  class MockApiError extends Error {
    status: number;
    code: string;
    constructor(status = 500, code = "error") {
      super("mock api error");
      this.status = status;
      this.code = code;
    }
  }
  return {
    api: {
      getSearchHistory: vi.fn(),
      deleteSearchHistoryEntry: vi.fn(() => Promise.resolve()),
      clearSearchHistory: vi.fn(() => Promise.resolve()),
    },
    ApiError: MockApiError,
    errorMessage: (_err: unknown, fallback: string) => fallback,
  };
});

import { ApiError, api } from "@/lib/api";
import { SearchSettingsView } from "./SearchSettingsView";

const getSearchHistory = vi.mocked(api.getSearchHistory);
const deleteSearchHistoryEntry = vi.mocked(api.deleteSearchHistoryEntry);
const clearSearchHistory = vi.mocked(api.clearSearchHistory);

beforeEach(() => {
  sessionStatus = "authed";
  sessionUser = {
    id: "u1",
    search_history_enabled: true,
    personalized_search_enabled: true,
    personalized_recommendations_enabled: false,
  };
  getSearchHistory.mockResolvedValue({ entries: [], limit: 100, offset: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchSettingsView — preferences", () => {
  it("reflects the user's current preferences", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect((screen.getByLabelText("Keep my search history") as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByLabelText("Personalize my search results") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Personalize my recommendations") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("saves a single changed field and shows a saved status", async () => {
    render(<SearchSettingsView />);
    const toggle = screen.getByLabelText("Personalize my recommendations");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ personalized_recommendations_enabled: true }),
    );
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("reverts the toggle and reports an error when the save fails", async () => {
    updateProfile.mockRejectedValueOnce(new Error("nope"));
    render(<SearchSettingsView />);
    const toggle = screen.getByLabelText("Keep my search history") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.checked).toBe(true)); // reverted
    expect(screen.getByText("Could not save that change.")).toBeTruthy();
  });
});

describe("SearchSettingsView — history", () => {
  it("lists entries and deletes one on request", async () => {
    getSearchHistory.mockResolvedValue({
      entries: [
        { query: "cats", normalized_query: "cats", last_used_at: "2026-01-01T00:00:00Z", use_count: 2 },
      ],
      limit: 100,
      offset: 0,
    });
    render(<SearchSettingsView />);
    expect(await screen.findByText("cats")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Remove .*cats.* from your search history/i }),
    );
    expect(deleteSearchHistoryEntry).toHaveBeenCalledWith("cats");
    await waitFor(() => expect(screen.queryByText("cats")).toBeNull());
  });

  it("clears the whole history after confirming", async () => {
    getSearchHistory.mockResolvedValue({
      entries: [{ query: "one", normalized_query: "one", use_count: 1 }],
      limit: 100,
      offset: 0,
    });
    render(<SearchSettingsView />);
    await screen.findByText("one");

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    // Confirm modal → clear.
    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    await waitFor(() => expect(clearSearchHistory).toHaveBeenCalled());
    expect(await screen.findByText("You have no saved searches.")).toBeTruthy();
  });

  it("shows a temporarily-unavailable state on a 503", async () => {
    // The mocked ApiError takes (status, code); cast past the real 1-arg type.
    const ApiErrorCtor = ApiError as unknown as new (status: number, code: string) => Error;
    getSearchHistory.mockRejectedValue(new ApiErrorCtor(503, "search_unavailable"));
    render(<SearchSettingsView />);
    expect(
      await screen.findByText("Search history is temporarily unavailable"),
    ).toBeTruthy();
  });
});

describe("SearchSettingsView — signed out", () => {
  it("prompts to sign in when the session has ended", () => {
    sessionStatus = "anon";
    sessionUser = null;
    render(<SearchSettingsView />);
    expect(screen.getByText("Sign in to manage your search settings")).toBeTruthy();
    expect(getSearchHistory).not.toHaveBeenCalled();
  });
});
