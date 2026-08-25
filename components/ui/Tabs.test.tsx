// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tabs } from "./Tabs";

afterEach(cleanup);

const tabs = [
  { id: "a", label: "First", panel: <p>Panel A</p> },
  { id: "b", label: "Second", panel: <p>Panel B</p> },
  { id: "c", label: "Third", panel: <p>Panel C</p> },
];

describe("Tabs", () => {
  it("selects the first tab by default and shows its panel", () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    const first = screen.getByRole("tab", { name: "First" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    // Roving tabindex: only the active tab is in the tab order.
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tab", { name: "Second" }).getAttribute("tabindex")).toBe("-1");
    expect(screen.getByText("Panel A")).toBeTruthy();
    expect(screen.queryByText("Panel B")).toBeNull();
  });

  it("honors defaultTabId", () => {
    render(<Tabs tabs={tabs} label="Sections" defaultTabId="b" />);
    expect(screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Panel B")).toBeTruthy();
  });

  it("activates a tab on click and swaps the panel", () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    fireEvent.click(screen.getByRole("tab", { name: "Third" }));
    expect(screen.getByRole("tab", { name: "Third" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Panel C")).toBeTruthy();
  });

  it("moves selection with ArrowRight and wraps at the end", () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    const first = screen.getByRole("tab", { name: "First" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Second" }));

    fireEvent.keyDown(screen.getByRole("tab", { name: "Second" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Third" }), { key: "ArrowRight" });
    // Wrapped back to the first.
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "First" }));
  });

  it("supports Home and End", () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    const first = screen.getByRole("tab", { name: "First" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Third" }));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Third" }), { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "First" }));
  });

  it("links each panel to its tab via aria", () => {
    render(<Tabs tabs={tabs} label="Sections" />);
    const tab = screen.getByRole("tab", { name: "First" });
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.getAttribute("id"));
    expect(tab.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
  });
  it("lets a caller own the selection, so the active tab can live in the URL", () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <Tabs tabs={tabs} label="Sections" activeTabId="b" onTabChange={onTabChange} />,
    );
    expect(screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Third" }));
    // Controlled: the caller is told, and NOTHING moves until it says so — the
    // URL is the source of truth, not a second copy of it in component state.
    expect(onTabChange).toHaveBeenCalledWith("c");
    expect(screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected")).toBe("true");

    rerender(<Tabs tabs={tabs} label="Sections" activeTabId="c" onTabChange={onTabChange} />);
    expect(screen.getByRole("tab", { name: "Third" }).getAttribute("aria-selected")).toBe("true");
  });

  it("still notifies an uncontrolled caller", () => {
    const onTabChange = vi.fn();
    render(<Tabs tabs={tabs} label="Sections" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Second" }));
    expect(onTabChange).toHaveBeenCalledWith("b");
    expect(screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected")).toBe("true");
  });
});
