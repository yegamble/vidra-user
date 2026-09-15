// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      // The real lib/search-events (NOT mocked here) posts through this when a
      // batch flushes; the refresh-race tests below drive that path for real.
      postSearchEvents: vi.fn(() => Promise.resolve()),
    },
    ApiError: MockApiError,
    errorMessage: (_err: unknown, fallback: string) => fallback,
  };
});

import { ApiError, api } from "@/lib/api";
import { flush, resetSearchEventsForTest, trackSearchEvent } from "@/lib/search-events";
import { SoftwareBrandProvider } from "@/components/SoftwareBrandProvider";
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
  resetSearchEventsForTest();
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
    expect(await screen.findByText(/You have no saved searches/)).toBeTruthy();
  });

});

// The mocked ApiError takes (status, code); cast past the real 1-arg type.
const apiError = (status: number, code: string) =>
  new (ApiError as unknown as new (status: number, code: string) => Error)(status, code);

// A 503 from core means "search is down OR was never wired" — on an instance
// that never runs vidra-search it is PERMANENT. A 403 feature_disabled is a
// deliberate admin decision. Neither is "try again in a little while".
describe("SearchSettingsView — 403 and 503 are different history states", () => {
  it("reads a 503 as the search service, and never promises it is temporary", async () => {
    getSearchHistory.mockRejectedValue(apiError(503, "search_unavailable"));
    render(<SearchSettingsView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/search service/i);
    expect(alert.textContent).not.toMatch(/temporar/i);
    expect(alert.textContent).not.toMatch(/in a little while/i);
    // A retry is offered, but qualified: "not configured" never resolves itself.
    expect(alert.textContent).toMatch(/Retrying helps only if/i);
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });

  it("reads a 403 feature_disabled as smart search being switched off, with no retry", async () => {
    getSearchHistory.mockRejectedValue(apiError(403, "feature_disabled"));
    render(<SearchSettingsView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/smart search is switched off/i);
    expect(screen.queryByRole("button", { name: /try again|retry/i })).toBeNull();
  });

  it("reads a plain 403 as a permission denial, with no retry", async () => {
    getSearchHistory.mockRejectedValue(apiError(403, "forbidden"));
    render(<SearchSettingsView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/permission/i);
    expect(alert.textContent).not.toMatch(/smart search is switched off/i);
    expect(screen.queryByRole("button", { name: /try again|retry/i })).toBeNull();
  });

  it("keeps a retry on an ordinary failure", async () => {
    getSearchHistory.mockRejectedValue(apiError(500, "internal"));
    render(<SearchSettingsView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Could not load your search history/i);
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });
});

// Limb A: /instance publishes the operator half of every gate on this page.
// Core ANDs it with the user row (vidra-core internal/httpapi/search.go), so a
// user row saying "on" against an instance saying "off" changes nothing — and
// the page used to answer "Saved." in green anyway.
describe("SearchSettingsView — instance gates", () => {
  const ADMIN_OFF = /Turned off for everyone on this site by the administrator/i;

  it("treats an absent search block as ungated (older backend / failed fetch)", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    for (const label of [
      "Keep my search history",
      "Personalize my search results",
      "Personalize my recommendations",
    ]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(false);
    }
    expect(screen.queryByText(ADMIN_OFF)).toBeNull();
  });

  it("disables personalized search, with a reason and no PATCH, when the instance gate is off", async () => {
    render(<SearchSettingsView instanceSearch={{ personalized_search_enabled: false }} />);
    const box = screen.getByLabelText("Personalize my search results") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    // The user's own stored value stays visible — showing both facts is the point.
    expect(box.checked).toBe(true);
    expect(screen.getAllByText(ADMIN_OFF).length).toBe(1);
    fireEvent.click(box);
    // ...and a change dispatched straight at React's handler, past the disabled
    // attribute, must not reach PATCH either: the server WOULD accept the write,
    // and the page would then answer "Saved." for a change with no effect.
    fireEvent.change(box, { target: { checked: false } });
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  // BOTH personalization toggles are mode-gated, and the recommendations one was
  // the honest-copy hole: vidra-core computes `personalized` for the home and
  // related rails as `searchAdvanced() && instancePersonalizedRecs() && ...`
  // (core#168), so in the shipped `simple` default the control is exactly as
  // inert as its search sibling — and it accepted a click and said "Saved."
  it("disables BOTH personalization toggles when the instance ranks with simple mode", async () => {
    render(<SearchSettingsView instanceSearch={{ mode: "simple" }} />);
    for (const label of ["Personalize my search results", "Personalize my recommendations"]) {
      const box = screen.getByLabelText(label) as HTMLInputElement;
      expect(box.disabled).toBe(true);
      fireEvent.click(box);
      fireEvent.change(box, { target: { checked: !box.checked } });
    }
    expect(screen.getAllByText(/simple heuristics/i).length).toBe(2);
    // The history control is untouched by the mode: it stores rows, it does not rank.
    expect((screen.getByLabelText("Keep my search history") as HTMLInputElement).disabled).toBe(
      false,
    );
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("disables personalized recommendations, with a reason and no PATCH", async () => {
    render(
      <SearchSettingsView instanceSearch={{ personalized_recommendations_enabled: false }} />,
    );
    const box = screen.getByLabelText("Personalize my recommendations") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(screen.getAllByText(ADMIN_OFF).length).toBe(1);
    fireEvent.click(box);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("disables the history toggle, fetches no history, and shows no error when history is off site-wide", async () => {
    render(<SearchSettingsView instanceSearch={{ search_history_enabled: false }} />);
    const box = screen.getByLabelText("Keep my search history") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    expect(screen.getAllByText(ADMIN_OFF).length).toBe(1);

    expect(await screen.findByText(/does not record search history/i)).toBeTruthy();
    // Never an error — the operator chose this.
    expect(screen.queryByRole("alert")).toBeNull();
    // And never a request: the endpoint would answer 200 with stale entries.
    await Promise.resolve();
    expect(getSearchHistory).not.toHaveBeenCalled();

    fireEvent.click(box);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("still lets the user erase searches stored before history was switched off", async () => {
    render(<SearchSettingsView instanceSearch={{ search_history_enabled: false }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear all" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    await waitFor(() => expect(clearSearchHistory).toHaveBeenCalled());
  });
});

// The A13 opt-out ruling made this page's copy load-bearing: the promise it
// states is now the promise the server keeps, so the words are tested.
describe("SearchSettingsView — the opt-out promise, in words", () => {
  it("says what turning all three off does to collection, not just to serving", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    // The rule: nothing left active → stored as a signed-out visitor's are.
    expect(screen.getByText(/none of them is active for you/i)).toBeTruthy();
    expect(screen.getByText(/signed-out visitor/i)).toBeTruthy();
  });

  // The owner's follow-on ruling: the opt-out covers PLAYBACK TELEMETRY too
  // (core#192 — the QoE beacon now consults the same searchConsent predicate).
  // A promise the server keeps and the page does not state is a promise nobody
  // can act on, so the sentence is tested like the rest of them.
  it("says the opt-out covers the playback quality measurements as well", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect(screen.getByText(/quality measurements this site takes while you watch/i)).toBeTruthy();
    // And is honest about what does NOT stop: the measurement still counts, it
    // just stops carrying a pseudonym for this viewer.
    expect(screen.getByText(/anonymous playback totals/i)).toBeTruthy();
  });

  it("is honest that earlier activity is not retroactively unlinked", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect(screen.getByText(/90 days/i)).toBeTruthy();
    expect(screen.getByText(/before you turned it off/i)).toBeTruthy();
  });

  // Clear all used to ANONYMISE the search service's raw rows; vidra-search#37
  // made it delete them. The page said "unlinks the rest from your account",
  // which now understates what the button does — and understating a deletion is
  // as wrong as overstating one, because it is the sentence a reader uses to
  // decide whether pressing it is enough.
  it("says Clear all deletes the raw records rather than unlinking them", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalled());
    expect(screen.getByText(/deletes your stored searches/i)).toBeTruthy();
    expect(screen.getByText(/not just your name from them/i)).toBeTruthy();
    // And it is equally honest about what it CANNOT delete: the aggregate
    // counters, which expire rather than being edited.
    expect(screen.getByText(/recomputed without you within a day/i)).toBeTruthy();
    expect(screen.getByText(/expire within 8 days/i)).toBeTruthy();
    expect(screen.queryByText(/unlinks the rest from your account/i)).toBeNull();
  });
});

// An opted-out user's history list is empty by construction — and the rows that
// still name them live in ledgers this list never shows. Hiding the one control
// that erases those rows behind "the list is non-empty" left exactly the users
// who most want it with no way to reach it.
describe("SearchSettingsView — clear-all reachability", () => {
  it("offers Clear all even when the list is empty", async () => {
    render(<SearchSettingsView />);
    expect(await screen.findByText(/You have no saved searches/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    await waitFor(() => expect(clearSearchHistory).toHaveBeenCalled());
  });

  it("does not offer it while the list is still loading or has failed", async () => {
    let resolve: (v: unknown) => void = () => {};
    getSearchHistory.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never);
    render(<SearchSettingsView />);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    resolve({ entries: [], limit: 100, offset: 0 });
    expect(await screen.findByRole("button", { name: "Clear all" })).toBeTruthy();
  });
});

// The refresh race (Wave A): the history list is read ONCE on mount, but the
// search that should appear in it rides a ~5s behavioural-event batch and is
// written to the server AFTER that batch flushes. Reading only on mount left a
// just-made search invisible until a manual reload. The fix subscribes to the
// flush-landed signal and refreshes the list — bounded, never polling.
describe("SearchSettingsView — a just-made search refreshes without a manual reload", () => {
  const entry = (query: string) => ({
    query,
    normalized_query: query,
    last_used_at: "2026-09-15T00:00:00Z",
    use_count: 1,
  });

  it("shows a search made just before landing here, once its batched event flushes", async () => {
    // Mount reads an empty history: the search's `search.submitted` event has not
    // been flushed yet (it rides a batch), so the row does not exist server-side.
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/You have no saved searches/)).toBeTruthy();
    expect(screen.queryByText("just-searched")).toBeNull();

    // The next read (once the flush lands) carries the new row.
    getSearchHistory.mockResolvedValue({
      entries: [entry("just-searched")],
      limit: 100,
      offset: 0,
    });

    // Drive a REAL search event through lib/search-events and flush it. No
    // remount, no manual reload — the already-mounted section reflects it itself.
    await act(async () => {
      trackSearchEvent({ type: "search.submitted", query: "just-searched" });
      flush();
      await Promise.resolve();
    });

    expect(await screen.findByText("just-searched")).toBeTruthy();
    // Bounded: the mount read plus the reconcile read that saw the change (it
    // stops the instant the list changes) — nowhere near a poll.
    expect(getSearchHistory.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("does not re-read history when a non-search event flushes", async () => {
    render(<SearchSettingsView />);
    await waitFor(() => expect(getSearchHistory).toHaveBeenCalledTimes(1));

    // An impression/play event writes nothing to search history.
    await act(async () => {
      trackSearchEvent({ type: "video.impression", video_id: "v1", context: "home" });
      flush();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getSearchHistory).toHaveBeenCalledTimes(1);
  });

  it("refreshes a bounded number of times and then stops when the write lags", async () => {
    vi.useFakeTimers();
    try {
      // The row never becomes visible to the read — server ingest lags past the
      // whole reconcile window — so the loop cannot early-exit on a change.
      render(<SearchSettingsView />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getSearchHistory).toHaveBeenCalledTimes(1);

      await act(async () => {
        trackSearchEvent({ type: "search.submitted", query: "ghost" });
        flush();
        await vi.advanceTimersByTimeAsync(2_500 * 12);
      });

      const total = getSearchHistory.mock.calls.length;
      // Mount read + a small, FIXED number of reconcile reads. Bounded on purpose:
      // a regression to standing polling would blow far past this.
      expect(total).toBeGreaterThan(1);
      expect(total).toBeLessThanOrEqual(4);

      // Genuinely stopped: no further reads however long we wait.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_500 * 12);
      });
      expect(getSearchHistory.mock.calls.length).toBe(total);
    } finally {
      vi.useRealTimers();
    }
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

// White-label (branding.hide_software_name): the privacy explainer and the
// shared "could not reach the search service" sentence both name the software as
// their subject. Both keep every factual claim and only change that subject.
describe("SearchSettingsView while white-labelled", () => {
  const show = (hidden: boolean) =>
    render(
      <SoftwareBrandProvider hidden={hidden}>
        <SearchSettingsView />
      </SoftwareBrandProvider>,
    );

  it("names the software in the personalization explainer by default", async () => {
    show(false);
    expect(
      await screen.findByText(/Vidra can use your searches and what you watch/),
    ).toBeTruthy();
  });

  it("neutralizes the personalization explainer when hidden", async () => {
    show(true);
    expect(
      await screen.findByText(/This platform can use your searches and what you watch/),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });

  it("neutralizes the shared search-service failure sentence when hidden", async () => {
    getSearchHistory.mockRejectedValue(apiError(503, "search_unavailable"));
    show(true);
    const alert = await screen.findByRole("alert");
    // Every claim survives: both causes named, no promise about time, and the
    // qualified retry.
    expect(alert.textContent).toContain(
      "This platform could not reach the search service. It may be offline, or not configured on this instance.",
    );
    expect(alert.textContent).toMatch(/Retrying helps only if/i);
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });

  it("still names the software in that sentence by default", async () => {
    getSearchHistory.mockRejectedValue(apiError(503, "search_unavailable"));
    show(false);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Vidra could not reach the search service.");
  });
});
