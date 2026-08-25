// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterPanel } from "./FilterPanel";

afterEach(cleanup);

function fields() {
  return (
    <>
      <input aria-label="Category" />
      <input aria-label="Language" />
    </>
  );
}

describe("FilterPanel", () => {
  it("starts collapsed with the panel hidden but wired to the toggle", () => {
    render(<FilterPanel>{fields()}</FilterPanel>);
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId as string);
    // Stays mounted (so aria-controls resolves and field values survive), hidden.
    expect(panel).toBeTruthy();
    expect(panel?.hasAttribute("hidden")).toBe(true);
  });

  it("reveals the fields and moves focus to the first one", () => {
    render(<FilterPanel>{fields()}</FilterPanel>);
    const toggle = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls") as string);
    expect(panel?.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Category"));
  });

  it("collapses on Escape and returns focus to the toggle", () => {
    render(<FilterPanel>{fields()}</FilterPanel>);
    const toggle = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(toggle);
    fireEvent.keyDown(screen.getByLabelText("Category"), { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("spells the applied-filter count into the toggle's accessible name", () => {
    render(<FilterPanel activeCount={2}>{fields()}</FilterPanel>);
    // Visible text is still "Filters" (label-in-name), the count is announced.
    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("does not steal focus when it renders already open", () => {
    render(<FilterPanel defaultOpen>{fields()}</FilterPanel>);
    expect(document.activeElement).toBe(document.body);
  });

  it("defers to the caller when the open state is controlled", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FilterPanel open={false} onOpenChange={onOpenChange}>
        {fields()}
      </FilterPanel>,
    );
    const toggle = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(toggle);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // Still closed: the caller owns the state and has not moved it yet.
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    rerender(
      <FilterPanel open onOpenChange={onOpenChange}>
        {fields()}
      </FilterPanel>,
    );
    expect(screen.getByRole("button", { name: "Filters" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("renders a footer slot inside the panel", () => {
    render(
      <FilterPanel defaultOpen footer={<button type="button">Clear all</button>}>
        {fields()}
      </FilterPanel>,
    );
    expect(screen.getByRole("button", { name: "Clear all" })).toBeTruthy();
  });
});
