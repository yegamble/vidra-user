// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Isolate the combobox from the real event queue (no POST /search/events, no
// visibilitychange listeners, no timers) — just record what it would emit.
const trackSearchEvent = vi.fn();
vi.mock("@/lib/search-events", () => ({
  trackSearchEvent: (...args: unknown[]) => trackSearchEvent(...args),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getSearchSuggestions: vi.fn(),
    deleteSearchHistoryEntry: vi.fn(() => Promise.resolve()),
  },
}));

import { api } from "@/lib/api";
import type { SearchSuggestion } from "@/lib/api/types";

import { SearchAutocomplete } from "./SearchAutocomplete";

const getSearchSuggestions = vi.mocked(api.getSearchSuggestions);
const deleteSearchHistoryEntry = vi.mocked(api.deleteSearchHistoryEntry);

function response(suggestions: SearchSuggestion[]) {
  return { query: "", suggestions };
}

function s(text: string, extra: Partial<SearchSuggestion> = {}): SearchSuggestion {
  return { text, type: "query", is_personal: false, ...extra };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderCombobox(props: Partial<React.ComponentProps<typeof SearchAutocomplete>> = {}) {
  return render(<SearchAutocomplete landmarkLabel="Search" {...props} />);
}

describe("SearchAutocomplete — debounce", () => {
  beforeEach(() => vi.useFakeTimers());

  it("waits 200ms after typing before fetching, then fetches once", () => {
    getSearchSuggestions.mockResolvedValue(response([]));
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ab" } });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(getSearchSuggestions).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
    expect(getSearchSuggestions).toHaveBeenCalledWith("ab", { limit: 8 }, expect.any(AbortSignal));
  });

  it("never fetches when suggestions are disabled", () => {
    getSearchSuggestions.mockResolvedValue(response([s("anything")]));
    renderCombobox({ suggestionsEnabled: false });
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getSearchSuggestions).not.toHaveBeenCalled();
  });
});

describe("SearchAutocomplete — suggestions + aria", () => {
  it("opens a listbox of options with the correct combobox aria state", async () => {
    getSearchSuggestions.mockResolvedValue(response([s("cats"), s("cat videos"), s("cars")]));
    renderCombobox();
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ca" } });

    await screen.findByRole("listbox");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(trackSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "search.suggestions_shown", query: "ca", count: 3 }),
    );
  });

  it("announces the suggestion count in a polite live region", async () => {
    getSearchSuggestions.mockResolvedValue(response([s("one"), s("two")]));
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "on" } });
    await screen.findByRole("listbox");
    expect(screen.getByRole("status").textContent).toContain("2 suggestions available");
  });
});

describe("SearchAutocomplete — keyboard navigation", () => {
  async function open() {
    getSearchSuggestions.mockResolvedValue(response([s("alpha"), s("beta"), s("gamma")]));
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });
    await screen.findByRole("listbox");
    return input;
  }

  it("ArrowDown / ArrowUp / Home / End move aria-activedescendant and wrap", async () => {
    const input = await open();
    const options = screen.getAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(input, { key: "End" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[2].id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id); // wrap
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[2].id); // wrap
    fireEvent.keyDown(input, { key: "Home" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("Enter selects the active option and navigates to the query search", async () => {
    const input = await open();
    fireEvent.keyDown(input, { key: "ArrowDown" }); // active = "alpha"
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/search?q=alpha");
    expect(trackSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "search.suggestion_selected", suggestion: "alpha" }),
    );
  });

  it("Enter with no active option submits the raw typed query", async () => {
    await open();
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith("/search?q=a");
  });

  it("Escape closes the popup, then a second Escape clears the field", async () => {
    const input = (await open()) as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(input.value).toBe("a");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });
});

describe("SearchAutocomplete — selection routing", () => {
  it("routes video / channel / tag suggestions to their destinations", async () => {
    getSearchSuggestions.mockResolvedValue(
      response([
        s("A cat video", { type: "video", video_id: "vid-1" }),
        s("catchannel", { type: "channel", channel_handle: "cats" }),
        s("kittens", { type: "tag" }),
      ]),
    );
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cat" } });
    let options = await screen.findAllByRole("option");
    fireEvent.click(options[0]);
    expect(push).toHaveBeenLastCalledWith("/videos/vid-1");

    fireEvent.focus(input); // suggestions still in state → reopens
    options = await screen.findAllByRole("option");
    fireEvent.click(options[1]);
    expect(push).toHaveBeenLastCalledWith("/channels/cats");

    fireEvent.focus(input);
    options = await screen.findAllByRole("option");
    fireEvent.click(options[2]);
    expect(push).toHaveBeenLastCalledWith("/search?tag=kittens");
  });
});

describe("SearchAutocomplete — IME composition gate", () => {
  beforeEach(() => vi.useFakeTimers());

  it("does not fetch mid-composition and fetches once composition ends", () => {
    getSearchSuggestions.mockResolvedValue(response([]));
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "に" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(getSearchSuggestions).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
    expect(getSearchSuggestions).toHaveBeenCalledWith("に", { limit: 8 }, expect.any(AbortSignal));
  });
});

describe("SearchAutocomplete — stale response discard", () => {
  beforeEach(() => vi.useFakeTimers());

  it("ignores an out-of-order (superseded) response", async () => {
    const deferred: Array<(v: unknown) => void> = [];
    getSearchSuggestions.mockImplementation(
      () => new Promise((resolve) => deferred.push(resolve as (v: unknown) => void)),
    );
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: "a" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(deferred).toHaveLength(2);

    // Resolve the NEWER request first, then the older, superseded one.
    await act(async () => {
      deferred[1]({ query: "ab", suggestions: [s("newer")] });
    });
    await act(async () => {
      deferred[0]({ query: "a", suggestions: [s("older")] });
    });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("newer");
  });
});

describe("SearchAutocomplete — history removal", () => {
  it("removes a history option via its × button and calls the delete endpoint", async () => {
    getSearchSuggestions.mockResolvedValue(
      response([
        s("past search", { type: "history", is_personal: true }),
        s("other", { type: "query" }),
      ]),
    );
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pa" } });
    await screen.findByRole("listbox");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);

    // The × is aria-hidden (outside the combobox aria flow), so it is queried as
    // the history option's descendant button rather than by role.
    const remove = options[0].querySelector("button");
    expect(remove).not.toBeNull();
    fireEvent.click(remove!);

    expect(deleteSearchHistoryEntry).toHaveBeenCalledWith("past search");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(push).not.toHaveBeenCalled(); // removing must not navigate
  });
});
