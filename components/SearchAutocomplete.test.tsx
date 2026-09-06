// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
// Mutable route state so tests can render the header box on any page and mutate
// the reflected /search query the way client-side navigation would.
const nav = vi.hoisted(() => ({ pathname: "/", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
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

// The session in context. null is the shipped default for this file: the box
// is rendered bare here, with no AuthProvider above it, which is exactly what
// useOptionalSession answers null for.
let optionalSession: { status: string; user: { id: string } | null } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => optionalSession,
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
  nav.pathname = "/";
  nav.params = new URLSearchParams();
  optionalSession = null;
});

function renderBox(props: Partial<React.ComponentProps<typeof SearchAutocomplete>> = {}) {
  return render(<SearchAutocomplete {...props} />);
}

// The header renders the desktop pill combobox and a phone trigger button;
// jsdom has no CSS so both are in the tree — scope to the (single, when the
// mobile sheet is closed) combobox input.
function combobox() {
  return screen.getByRole("combobox") as HTMLInputElement;
}

describe("SearchAutocomplete — debounce", () => {
  beforeEach(() => vi.useFakeTimers());

  it("waits 200ms after typing before fetching, then fetches once", () => {
    getSearchSuggestions.mockResolvedValue(response([]));
    renderBox();
    const input = combobox();
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
});

describe("SearchAutocomplete — plain-field fallback when suggestions are disabled", () => {
  beforeEach(() => vi.useFakeTimers());

  // The hard requirement: the box's form logic is identical whether the smart
  // search service is serving or not. With suggestions off it is a plain search
  // field — it renders, accepts input, submits to /search, and never fetches.
  it("renders, accepts input, submits to /search?q=…, and performs zero suggestion fetches", () => {
    getSearchSuggestions.mockResolvedValue(response([s("anything")]));
    renderBox({ suggestionsEnabled: false });
    const input = combobox();
    expect(input).toBeTruthy();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "reactor design" } });
    expect(input.value).toBe("reactor design");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // No popup ever opens.
    expect(screen.queryByRole("listbox")?.hasAttribute("hidden") ?? true).toBe(true);

    fireEvent.submit(screen.getAllByRole("search")[0]);
    expect(push).toHaveBeenCalledWith("/search?q=reactor+design");
    // Never fetched — not once, at any point.
    expect(getSearchSuggestions).not.toHaveBeenCalled();
  });
});

describe("SearchAutocomplete — suggestions + aria", () => {
  it("opens a listbox of options with the correct combobox aria state", async () => {
    getSearchSuggestions.mockResolvedValue(response([s("cats"), s("cat videos"), s("cars")]));
    renderBox();
    const input = combobox();
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
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "on" } });
    await screen.findByRole("listbox");
    expect(screen.getAllByRole("status")[0].textContent).toContain("2 suggestions available");
  });

  it("bolds the typed prefix and leaves the completion in a regular weight", async () => {
    getSearchSuggestions.mockResolvedValue(response([s("cats and dogs")]));
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cat" } });
    const option = await screen.findByRole("option");
    const strong = option.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("cat");
    // The full label is still the option's text (the <strong> is a visual accent).
    expect(option.textContent).toContain("cats and dogs");
  });
});

describe("SearchAutocomplete — grouping", () => {
  it("renders a group header only for a non-empty typed group", async () => {
    getSearchSuggestions.mockResolvedValue(
      response([
        s("golf swing"),
        s("golf tips", { type: "history" }),
        s("Golf highlights", { type: "video", video_id: "v1" }),
        s("Golf Channel", { type: "channel", channel_handle: "golf" }),
        s("golfing", { type: "tag" }),
      ]),
    );
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "gol" } });
    await screen.findByRole("listbox");

    // Plural group headers render for the video/channel/tag groups…
    expect(screen.getByText("Videos")).toBeTruthy();
    expect(screen.getByText("Channels")).toBeTruthy();
    expect(screen.getByText("Tags")).toBeTruthy();
    // …but the query/history flat block gets no header.
    expect(screen.queryByText("Queries")).toBeNull();
  });

  it("renders no group headers when only queries/history are present", async () => {
    getSearchSuggestions.mockResolvedValue(
      response([s("alpha"), s("beta", { type: "history" })]),
    );
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });
    await screen.findByRole("listbox");
    expect(screen.queryByText("Videos")).toBeNull();
    expect(screen.queryByText("Channels")).toBeNull();
    expect(screen.queryByText("Tags")).toBeNull();
  });
});

describe("SearchAutocomplete — keyboard navigation", () => {
  async function open() {
    getSearchSuggestions.mockResolvedValue(response([s("alpha"), s("beta"), s("gamma")]));
    renderBox();
    const input = combobox();
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
    fireEvent.submit(screen.getAllByRole("search")[0]);
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
    renderBox();
    const input = combobox();
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

describe("SearchAutocomplete — /search URL reflection", () => {
  it("seeds the box from the results-page query and threads active filters on submit", () => {
    nav.pathname = "/search";
    nav.params = new URLSearchParams("q=go&category=7&tag=photography");
    getSearchSuggestions.mockResolvedValue(response([]));
    renderBox();
    const input = combobox();
    expect(input.value).toBe("go");

    fireEvent.change(input, { target: { value: "rust" } });
    fireEvent.submit(screen.getAllByRole("search")[0]);
    // Query updates but the URL filters ride along (order: q, category, tag).
    expect(push).toHaveBeenCalledWith("/search?q=rust&category=7&tag=photography");
  });

  it("re-seeds the draft when the reflected query changes (client navigation)", () => {
    nav.pathname = "/search";
    nav.params = new URLSearchParams("q=cats");
    getSearchSuggestions.mockResolvedValue(response([]));
    const { rerender } = renderBox();
    expect(combobox().value).toBe("cats");

    // A client-side nav to a new query re-runs the hooks with fresh params.
    nav.params = new URLSearchParams("q=dogs");
    rerender(<SearchAutocomplete />);
    expect(combobox().value).toBe("dogs");
  });

  it("clearing on /search drops the query but keeps the filters", () => {
    nav.pathname = "/search";
    nav.params = new URLSearchParams("q=go&language=en");
    getSearchSuggestions.mockResolvedValue(response([]));
    renderBox();
    const input = combobox();
    expect(input.value).toBe("go");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input.value).toBe("");
    expect(push).toHaveBeenCalledWith("/search?language=en");
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
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pa" } });
    await screen.findByRole("listbox");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);

    // The remove × only renders on the active/hovered history row; hovering it
    // marks it active (activedescendant) and reveals the aria-hidden button.
    fireEvent.mouseMove(options[0]);
    const remove = options[0].querySelector("button");
    expect(remove).not.toBeNull();
    fireEvent.click(remove!);

    expect(deleteSearchHistoryEntry).toHaveBeenCalledWith("past search");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(push).not.toHaveBeenCalled(); // removing must not navigate
  });

  it("removes the active history option on the Delete key", async () => {
    getSearchSuggestions.mockResolvedValue(
      response([s("past search", { type: "history", is_personal: true }), s("other")]),
    );
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pa" } });
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "ArrowDown" }); // active = history row
    fireEvent.keyDown(input, { key: "Delete" });
    expect(deleteSearchHistoryEntry).toHaveBeenCalledWith("past search");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("SearchAutocomplete — mobile overlay", () => {
  beforeEach(() => {
    // The auto-open probe and the sheet's own render read matchMedia; stub it.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it("opens the sheet from the trigger, focuses the input, and Escape returns focus", async () => {
    getSearchSuggestions.mockResolvedValue(response([]));
    renderBox();
    const trigger = screen.getByRole("button", { name: "Search" });
    fireEvent.click(trigger);

    // The sheet portals in a second search landmark with its own input, focused.
    const sheet = await screen.findByRole("button", { name: "Close search" });
    const overlay = sheet.closest("div.fixed") as HTMLElement;
    const sheetInput = within(overlay).getByRole("combobox") as HTMLInputElement;
    expect(document.activeElement).toBe(sheetInput);

    // Escape closes the sheet and returns focus to the trigger.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Close search" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("the back button closes the sheet and restores focus to the trigger", async () => {
    getSearchSuggestions.mockResolvedValue(response([]));
    renderBox();
    const trigger = screen.getByRole("button", { name: "Search" });
    fireEvent.click(trigger);
    const back = await screen.findByRole("button", { name: "Close search" });
    fireEvent.click(back);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Close search" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });
});

// ⌘K / Ctrl+K / "/" focus the site search from anywhere, and the keycap makes
// that discoverable. jsdom has no layout, so the breakpoint the handler routes
// on is stubbed per test (the real matchMedia is restored after each).
describe("SearchAutocomplete — global focus shortcuts", () => {
  const realMatchMedia = window.matchMedia;

  function stubViewport(phone: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: phone && query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  /** A focused field elsewhere on the page (a comment box, a settings input). */
  function otherField(): HTMLInputElement {
    const el = document.createElement("input");
    document.body.appendChild(el);
    el.focus();
    return el;
  }

  beforeEach(() => {
    getSearchSuggestions.mockResolvedValue(response([]));
    stubViewport(false);
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("⌘K focuses the header field from anywhere and selects the existing draft", () => {
    renderBox();
    const input = combobox();
    fireEvent.change(input, { target: { value: "reactor" } });
    const other = otherField();
    expect(document.activeElement).toBe(other);

    fireEvent.keyDown(other, { key: "k", metaKey: true });

    expect(document.activeElement).toBe(input);
    // Selected, not appended: the next keystroke replaces the old query.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("reactor".length);
    other.remove();
  });

  it("Ctrl+K does the same for non-mac keyboards", () => {
    renderBox();
    const input = combobox();
    const other = otherField();

    fireEvent.keyDown(other, { key: "k", ctrlKey: true });

    expect(document.activeElement).toBe(input);
    other.remove();
  });

  it('"/" focuses the field, but stays a character while another field has the caret', () => {
    renderBox();
    const input = combobox();

    const other = otherField();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
    other.remove();

    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(input);
  });

  it("stays out of the way while a modal dialog owns focus", () => {
    renderBox();
    const input = combobox();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);

    fireEvent.keyDown(document.body, { key: "k", metaKey: true });

    expect(document.activeElement).not.toBe(input);
    dialog.remove();
  });

  it("opens the full-screen sheet instead of the pill on phones", async () => {
    stubViewport(true);
    renderBox();

    fireEvent.keyDown(document.body, { key: "k", metaKey: true });

    const sheet = await screen.findByRole("button", { name: "Close search" });
    expect(sheet).toBeTruthy();
  });

  it("Escape unwinds the field: clear the draft, then release focus", () => {
    renderBox();
    const input = combobox();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "reactor" } });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).not.toBe(input);
  });

  it("shows the keycap while the field is empty and swaps it for clear once typing", () => {
    renderBox();
    expect(screen.getByTestId("search-shortcut-hint")).toBeTruthy();

    fireEvent.change(combobox(), { target: { value: "x" } });

    expect(screen.queryByTestId("search-shortcut-hint")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });

  it("announces the shortcut to assistive tech on the header input", () => {
    renderBox();
    expect(combobox().getAttribute("aria-keyshortcuts")).toBe("Meta+K Control+K /");
  });
});

// GET /search/suggestions is PER VIEWER: a signed-in caller whose instance and
// preference allow it gets their own past searches back as `history`-typed
// personal suggestions, and the whole set is ranked for them. Asking before
// the refresh cookie has been redeemed asks as an anonymous visitor — and the
// answer is then CACHED per prefix, so the anonymous set outlives the restore.
describe("SearchAutocomplete session settling", () => {
  beforeEach(() => vi.useFakeTimers());

  it("does not ask for suggestions while the session is still restoring", () => {
    optionalSession = { status: "restoring", user: null };
    getSearchSuggestions.mockResolvedValue(response([s("anything")]));
    renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getSearchSuggestions).not.toHaveBeenCalled();
  });

  it("asks exactly once when the session settles", () => {
    optionalSession = { status: "restoring", user: null };
    getSearchSuggestions.mockResolvedValue(response([s("anything")]));
    const { rerender } = renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    optionalSession = { status: "authed", user: { id: "u-1" } };
    rerender(<SearchAutocomplete />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
  });

  it("does not serve one viewer the suggestions cached for another", () => {
    // The per-prefix cache is what makes this more than a timing bug: an
    // anonymous answer taken once would be replayed to the signed-in viewer
    // for the rest of the tab's life.
    optionalSession = { status: "anon", user: null };
    getSearchSuggestions.mockResolvedValue(response([s("anonymous answer")]));
    const { rerender } = renderBox();
    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);

    optionalSession = { status: "authed", user: { id: "u-1" } };
    getSearchSuggestions.mockResolvedValue(response([s("their own history", { type: "history" })]));
    rerender(<SearchAutocomplete />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getSearchSuggestions).toHaveBeenCalledTimes(2);
  });
});
