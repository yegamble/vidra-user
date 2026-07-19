// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/link needs the App Router context; stub it to a ref-forwarding <a> so
// href rows are real, focusable links with assertable hrefs (the Dropdown
// attaches a ref for keyboard navigation, so the mock MUST forward it).
vi.mock("next/link", () => ({
  default: forwardRef<HTMLAnchorElement, { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>>(
    function MockLink({ href, children, onClick, ...props }, ref) {
      return (
        <a
          ref={ref}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            onClick?.(e);
          }}
          {...props}
        >
          {children}
        </a>
      );
    },
  ),
}));

import { Dropdown, type DropdownItem } from "./Dropdown";

afterEach(cleanup);

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
}

describe("Dropdown", () => {
  it("renders action rows as menuitem buttons and fires onSelect + closes", () => {
    const onSelect = vi.fn();
    render(
      <Dropdown
        trigger="Menu"
        triggerLabel="Menu"
        items={[{ label: "First", onSelect }, { label: "Second", onSelect: () => {} }]}
      />,
    );
    open();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    fireEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // The menu closes after a selection.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders an href row as a link menuitem with its icon marked decorative", () => {
    render(
      <Dropdown
        trigger="Menu"
        triggerLabel="Menu"
        items={[
          {
            label: "Upload video",
            href: "/studio/content?upload=1",
            icon: <svg data-testid="glyph" />,
          },
        ]}
      />,
    );
    open();
    const link = screen.getByRole("menuitem", { name: /Upload video/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/studio/content?upload=1");
    // The icon slot is aria-hidden so the label is the accessible name.
    const glyphWrap = screen.getByTestId("glyph").parentElement;
    expect(glyphWrap?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders a separator that is not a menuitem", () => {
    render(
      <Dropdown
        trigger="Menu"
        triggerLabel="Menu"
        items={[
          { label: "A", onSelect: () => {} },
          { type: "separator" },
          { label: "B", href: "/b" },
        ]}
      />,
    );
    open();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("separator")).toBeTruthy();
  });

  it("renders a group label that is not a menuitem", () => {
    render(
      <Dropdown
        trigger="Menu"
        triggerLabel="Menu"
        items={[
          { type: "label", label: "Your channels" },
          { label: "A", onSelect: () => {} },
          { type: "separator" },
          { type: "label", label: "Shared with you" },
          { label: "B", onSelect: () => {} },
        ]}
      />,
    );
    open();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByText("Your channels")).toBeTruthy();
    expect(screen.getByText("Shared with you")).toBeTruthy();
  });

  it("arrow keys move focus and wrap, skipping the separator", () => {
    render(
      <Dropdown
        trigger="Menu"
        triggerLabel="Menu"
        items={[
          { label: "A", onSelect: () => {} },
          { type: "separator" },
          { label: "B", onSelect: () => {} },
        ]}
      />,
    );
    open();
    const [a, b] = screen.getAllByRole("menuitem");
    a.focus();
    // Down from the first focusable row lands on the next focusable row (the
    // separator is not in the ring).
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(document.activeElement).toBe(b);
    // Down again wraps back to the first.
    fireEvent.keyDown(b, { key: "ArrowDown" });
    expect(document.activeElement).toBe(a);
    // Up from the first wraps to the last.
    fireEvent.keyDown(a, { key: "ArrowUp" });
    expect(document.activeElement).toBe(b);
  });

  it("Escape closes the menu and returns focus to the trigger", () => {
    render(
      <Dropdown trigger="Menu" triggerLabel="Menu" items={[{ label: "A", onSelect: () => {} }]} />,
    );
    open();
    const item = screen.getByRole("menuitem", { name: "A" });
    item.focus();
    fireEvent.keyDown(item, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" }));
  });

  it("Space activates an href row (link navigation) without needing a click", () => {
    const items: DropdownItem[] = [{ label: "Go", href: "/go", onSelect: vi.fn() }];
    render(<Dropdown trigger="Menu" triggerLabel="Menu" items={items} />);
    open();
    const link = screen.getByRole("menuitem", { name: "Go" }) as HTMLAnchorElement;
    const clicked = vi.fn();
    link.addEventListener("click", clicked);
    link.focus();
    fireEvent.keyDown(link, { key: " " });
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
