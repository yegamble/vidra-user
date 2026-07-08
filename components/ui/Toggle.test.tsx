// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toggle } from "./Toggle";

afterEach(cleanup);

describe("Toggle", () => {
  it("is a labeled switch reflecting checked state", () => {
    render(<Toggle checked onChange={() => {}} label="Autoplay next" />);
    const sw = screen.getByRole("switch", { name: "Autoplay next" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("calls onChange with the negated state on click", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Save replay" />);
    fireEvent.click(screen.getByRole("switch", { name: "Save replay" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Encrypted" disabled />);
    fireEvent.click(screen.getByRole("switch", { name: "Encrypted" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the design 46×28 track sizing", () => {
    render(<Toggle checked onChange={() => {}} label="X" />);
    const sw = screen.getByRole("switch", { name: "X" });
    expect(sw.className).toContain("h-7");
    expect(sw.className).toContain("w-[46px]");
  });
});
