// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);

vi.mock("@/lib/api/video-config", () => ({
  getVideoConfigCached: vi.fn(() =>
    Promise.resolve({
      categories: [{ id: "7", label: "Gaming" }],
      languages: [{ id: "en", label: "English" }],
      licenses: [{ id: "1", label: "Attribution" }],
      privacies: [],
    }),
  ),
}));

import { navigation } from "@/lib/test-navigation";
import { SearchFilters } from "./SearchFilters";

/** The panel's fields are mounted-but-hidden until the toggle is pressed. */
function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
}

beforeEach(() => navigation.reset("/search", "q=go"));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchFilters disclosure", () => {
  it("starts collapsed with no active-count badge on a plain search", () => {
    render(<SearchFilters query="go" filters={{}} />);

    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls") as string);
    expect(panel?.hasAttribute("hidden")).toBe(true);
  });

  it("counts the applied facets on the toggle, so a collapsed panel cannot hide them", () => {
    render(
      <SearchFilters query="go" filters={{ category: "7", duration: "short", sort: "-views" }} />,
    );

    // The visible text stays "Filters"; the state is spelled into the name.
    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeTruthy();
  });

  it("arrives open when the link that landed here already carried filters", () => {
    render(<SearchFilters query="go" filters={{ duration: "long" }} />);

    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("SearchFilters facets", () => {
  it("puts a chosen sort in the URL and keeps the default out of it", () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(navigation.pushed.at(-1)).toBe("/search?q=go&sort=-views");

    cleanup();
    render(<SearchFilters query="go" filters={{ sort: "-views" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Relevance" }));
    expect(navigation.pushed.at(-1)).toBe("/search?q=go");
  });

  it("stores a duration BUCKET, not the seconds it expands to", () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "4 – 10 minutes" }));
    expect(navigation.pushed.at(-1)).toBe("/search?q=go&duration=medium");
  });

  it("stores a publish window as a bucket, so a shared link keeps meaning", () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    // Not a baked timestamp: `?published=7d` still means "the last week"
    // tomorrow, where an ISO instant would drift into "the eight days before
    // you opened this".
    expect(navigation.pushed.at(-1)).toBe("/search?q=go&published=7d");
  });

  it("applies the taxonomy selects once the shared config arrives", async () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    const category = screen.getByLabelText("Category");
    await waitFor(() => expect((category as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(category, { target: { value: "7" } });

    expect(navigation.pushed.at(-1)).toBe("/search?q=go&category=7");
  });

  it("applies the license select from the same taxonomy", async () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    const license = screen.getByLabelText("License");
    await waitFor(() => expect((license as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(license, { target: { value: "1" } });

    expect(navigation.pushed.at(-1)).toBe("/search?q=go&license=1");
  });

  it("applies a comma-separated tag list on Enter, not on every keystroke", () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    const field = screen.getByLabelText("All of these tags");
    fireEvent.change(field, { target: { value: "Ocean, reef" } });
    expect(navigation.pushed).toHaveLength(0);

    fireEvent.keyDown(field, { key: "Enter" });
    expect(navigation.pushed.at(-1)).toBe("/search?q=go&tags_all=ocean%2Creef");
  });

  it("clears every facet at once, keeping the query and the tab", () => {
    render(
      <SearchFilters
        query="go"
        filters={{ category: "7", duration: "short" }}
        type="channels"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(navigation.pushed.at(-1)).toBe("/search?q=go&type=channels");
  });

  it("carries the active result tab onto every facet change", () => {
    render(<SearchFilters query="go" filters={{}} type="accounts" />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(navigation.pushed.at(-1)).toBe("/search?q=go&type=accounts&sort=-views");
  });

  it("renders no control for a facet the backend cannot answer", () => {
    render(<SearchFilters query="go" filters={{}} />);
    openPanel();

    // Original publication year, live-vs-VOD and instance host are absent
    // rather than present-and-inert: nothing stores them, and a control that
    // silently does nothing is worse than its absence. (Licence used to be on
    // this list; it is now indexed and filterable, so it has a control.)
    expect(screen.queryByLabelText(/publication year/i)).toBeNull();
    expect(screen.queryByLabelText(/instance host/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Live$/ })).toBeNull();
  });
});

describe("SearchFilters tag chip", () => {
  it("shows an arriving ?tag= filter outside the panel, with a link that removes it", () => {
    render(<SearchFilters query="go" filters={{ tag: "cats", category: "7" }} />);

    // Visible without opening anything — it is a filter the viewer did not set.
    expect(screen.getByText("#cats")).toBeTruthy();
    const remove = screen.getByRole("link", { name: "Remove tag filter cats" });
    expect(remove.getAttribute("href")).toBe("/search?q=go&category=7");
  });
});
