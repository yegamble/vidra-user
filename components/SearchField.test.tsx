// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { SearchField } from "./SearchField";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchField", () => {
  it("seeds the field with the committed query and offers no clear button when empty", () => {
    render(<SearchField query="" />);
    const input = screen.getByLabelText("Search videos") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("submitting navigates to /search, preserving the active filters", () => {
    render(<SearchField query="" filters={{ category: "7", tag: "photography" }} />);
    const input = screen.getByLabelText("Search videos");
    fireEvent.change(input, { target: { value: "  medium format  " } });
    fireEvent.submit(screen.getByRole("search"));
    // Query is trimmed and filters ride along (order: q, category, tag).
    expect(push).toHaveBeenCalledWith("/search?q=medium+format&category=7&tag=photography");
  });

  it("clearing empties the field and drops the query while keeping filters", () => {
    render(<SearchField query="grading" filters={{ language: "en" }} />);
    const input = screen.getByLabelText("Search videos") as HTMLInputElement;
    expect(input.value).toBe("grading");
    const clear = screen.getByRole("button", { name: "Clear search" });
    fireEvent.click(clear);
    expect(input.value).toBe("");
    // A committed query was present, so clearing navigates back to the prompt
    // (no q) with the filters preserved.
    expect(push).toHaveBeenCalledWith("/search?language=en");
  });

  it("exposes a distinctly-labelled search landmark", () => {
    render(<SearchField query="" />);
    expect(screen.getByRole("search", { name: "Search" })).toBeTruthy();
  });
});
