// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("renders a dialog labeled by its title", () => {
    render(
      <Modal title="Report this video" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    // aria-labelledby resolves to the <h2>, so the dialog's accessible name is
    // the title — this is exactly what Playwright's getByRole('dialog',{name})
    // relies on.
    expect(screen.getByRole("dialog", { name: "Report this video" })).toBeTruthy();
  });

  it("moves focus into the dialog on open", () => {
    render(
      <Modal title="Edit" onClose={() => {}} hideClose>
        <input aria-label="First field" />
        <button type="button">Second</button>
      </Modal>,
    );
    // First focusable inside the dialog receives focus (here the input, since
    // hideClose drops the header close button that would otherwise be first).
    expect(document.activeElement).toBe(screen.getByLabelText("First field"));
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked but not when the panel is", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit" onClose={onClose}>
        <p>panel body</p>
      </Modal>,
    );
    // Clicking the panel body must NOT close.
    fireEvent.click(screen.getByText("panel body"));
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the backdrop (the dialog's parent overlay) closes.
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the header close button", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab from the last focusable back to the first", () => {
    render(
      <Modal title="Edit" onClose={() => {}} hideClose>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    );
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });
});
