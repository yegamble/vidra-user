// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The ban list is the ONLY browser path to lifting a suggestion ban (before it,
// an abusive autosuggest entry could only be removed with raw SQL), so these
// cases pin the things that would silently make it useless: a fabricated count
// the contract cannot supply, and an error state that lies about whether
// retrying can ever work.

const mocks = vi.hoisted(() => ({
  listSuggestionBans: vi.fn(),
  banSuggestion: vi.fn(),
  unbanSuggestion: vi.fn(),
}));

vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/api", () => {
  // Same constructor shape as the real ApiError, so the call sites below need
  // no cast and the mock cannot drift from the type the component narrows on.
  class MockApiError extends Error {
    status: number;
    code: string;
    constructor(args: { status: number; code: string; message: string }) {
      super(args.message);
      this.status = args.status;
      this.code = args.code;
    }
  }
  return {
    api: {
      listSuggestionBans: mocks.listSuggestionBans,
      banSuggestion: mocks.banSuggestion,
      unbanSuggestion: mocks.unbanSuggestion,
    },
    ApiError: MockApiError,
    errorMessage: (_err: unknown, fallback: string) => fallback,
  };
});

import { ApiError } from "@/lib/api";
import { SuggestionBansView } from "./SuggestionBansView";

/** The backend's ErrorResponse envelope as the client surfaces it. */
function apiError(status: number, code: string) {
  return new ApiError({ status, code, message: code.replace(/_/g, " ") });
}

const entry = {
  normalized_query: "abusive phrase",
  query: "Abusive Phrase",
  total_count: 412,
  distinct_users: 37,
  first_seen: "2026-08-01T10:00:00Z",
  last_seen: "2026-08-29T10:00:00Z",
};

/** The contract's list envelope: entries + limit + offset, and NO total. */
function page(entries: unknown[], offset = 0) {
  return { entries, limit: 20, offset };
}

beforeEach(() => {
  mocks.listSuggestionBans.mockResolvedValue(page([entry]));
  mocks.banSuggestion.mockResolvedValue({ normalized_query: "spam query", banned: true });
  mocks.unbanSuggestion.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SuggestionBansView — the list", () => {
  it("renders each banned query with the evidence a second moderator judges it on", async () => {
    render(<SuggestionBansView />);
    expect(await screen.findByText("Abusive Phrase")).toBeTruthy();
    // The aggregate key is what an unban must target, so it is shown whenever it
    // differs from the display form.
    expect(screen.getByText(/abusive phrase/)).toBeTruthy();
    expect(screen.getByText(/412/)).toBeTruthy();
    expect(screen.getByText(/37/)).toBeTruthy();
  });

  it("shows a spinner while the first page is in flight", () => {
    mocks.listSuggestionBans.mockReturnValue(new Promise(() => {}));
    render(<SuggestionBansView />);
    expect(screen.getByRole("status", { name: /Loading banned queries/i })).toBeTruthy();
  });

  it("renders the shared empty state when nothing is banned", async () => {
    mocks.listSuggestionBans.mockResolvedValue(page([]));
    render(<SuggestionBansView />);
    expect(await screen.findByText("No queries are banned")).toBeTruthy();
  });

  it("invents no count: the list envelope carries no total, so none is rendered", async () => {
    mocks.listSuggestionBans.mockResolvedValue(page([entry, { ...entry, normalized_query: "b", query: "B" }]));
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");
    // No "2 banned queries", no "1–2 of 2", no "Showing 2".
    expect(screen.queryByText(/\d+\s+banned quer/i)).toBe(null);
    expect(screen.queryByText(/\bof\s+\d+\b/i)).toBe(null);
    expect(screen.queryByText(/showing/i)).toBe(null);
  });

  it("offers a keyboard-reachable Load more when a full page comes back", async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({
      ...entry,
      normalized_query: `q${i}`,
      query: `Q${i}`,
    }));
    mocks.listSuggestionBans.mockResolvedValue(page(full));
    render(<SuggestionBansView />);
    await screen.findByText("Q0");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mocks.listSuggestionBans).toHaveBeenCalledWith(
        { limit: 20, offset: 20 },
        expect.anything(),
      ),
    );
  });
});

describe("SuggestionBansView — 403 and 503 are different states", () => {
  it("reads a 503 search_unavailable as the search service, never as a plain failure", async () => {
    mocks.listSuggestionBans.mockRejectedValue(apiError(503, "search_unavailable"));
    render(<SuggestionBansView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/search service/i);
    // The previous council finding: promising a permanent outage is temporary.
    expect(alert.textContent).not.toMatch(/try again in a little while/i);
    expect(alert.textContent).toMatch(/not configured|offline|unreachable/i);
    // Unreachable may be transient, so a retry is offered — and it is the only
    // one of the three failure states that gets one. (The shared ErrorState
    // labels its retry "Try again".)
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("reads a 403 feature_disabled as smart search being switched off, with no retry", async () => {
    mocks.listSuggestionBans.mockRejectedValue(apiError(403, "feature_disabled"));
    render(<SuggestionBansView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/smart search/i);
    expect(alert.textContent).not.toMatch(/search service is/i);
    // Retrying can never succeed until an admin flips the setting.
    expect(screen.queryByRole("button", { name: /try again/i })).toBe(null);
  });

  it("reads a 403 permission denial as a permission problem, with no retry", async () => {
    mocks.listSuggestionBans.mockRejectedValue(apiError(403, "forbidden"));
    render(<SuggestionBansView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/permission|not allowed|moderator/i);
    expect(alert.textContent).not.toMatch(/smart search/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBe(null);
  });

  it("falls back to the shared error state with a retry for anything else", async () => {
    mocks.listSuggestionBans.mockRejectedValue(apiError(500, "internal"));
    render(<SuggestionBansView />);
    await screen.findByRole("alert");
    mocks.listSuggestionBans.mockResolvedValue(page([entry]));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Abusive Phrase")).toBeTruthy();
  });
});

describe("SuggestionBansView — banning", () => {
  it("bans the typed query and echoes the normalized key the server actually moved", async () => {
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");
    fireEvent.change(screen.getByLabelText("Ban a query from autosuggest"), {
      target: { value: "  Spam Query  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ban query" }));
    await waitFor(() => expect(mocks.banSuggestion).toHaveBeenCalledWith("Spam Query"));
    // The contract returns the normalized key BECAUSE it is what a later unban
    // must target — showing the typed string instead would strand the moderator.
    expect(await screen.findByText(/spam query/)).toBeTruthy();
    // The new ban is not in the loaded page, so the list is refetched rather
    // than faked from a response that carries no aggregate evidence.
    await waitFor(() => expect(mocks.listSuggestionBans).toHaveBeenCalledTimes(2));
  });

  it("does not submit a blank query", async () => {
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");
    fireEvent.change(screen.getByLabelText("Ban a query from autosuggest"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ban query" }));
    expect(mocks.banSuggestion).not.toHaveBeenCalled();
  });

  it("says the ban did NOT take effect when the search service is unreachable", async () => {
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");
    mocks.banSuggestion.mockRejectedValue(apiError(503, "search_unavailable"));
    fireEvent.change(screen.getByLabelText("Ban a query from autosuggest"), {
      target: { value: "spam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ban query" }));
    expect(await screen.findByText(/was not applied/i)).toBeTruthy();
  });
});

describe("SuggestionBansView — unbanning", () => {
  it("takes two deliberate steps and then drops the row", async () => {
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");

    // One stray tap must not lift a ban.
    fireEvent.click(screen.getByRole("button", { name: /Unban Abusive Phrase/i }));
    expect(mocks.unbanSuggestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    // The aggregate key, never the display form.
    await waitFor(() => expect(mocks.unbanSuggestion).toHaveBeenCalledWith("abusive phrase"));
    await waitFor(() => expect(screen.queryByText("Abusive Phrase")).toBe(null));
  });

  it("can be cancelled, leaving the row alone", async () => {
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");
    fireEvent.click(screen.getByRole("button", { name: /Unban Abusive Phrase/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.unbanSuggestion).not.toHaveBeenCalled();
    expect(screen.getByText("Abusive Phrase")).toBeTruthy();
  });

  it("keeps the row and explains when the unban fails", async () => {
    mocks.unbanSuggestion.mockRejectedValue(apiError(503, "search_unavailable"));
    render(<SuggestionBansView />);
    await screen.findByText("Abusive Phrase");
    fireEvent.click(screen.getByRole("button", { name: /Unban Abusive Phrase/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(/was not lifted/i)).toBeTruthy();
    expect(screen.getByText("Abusive Phrase")).toBeTruthy();
  });
});
