// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoplaySwitch } from "./AutoplaySwitch";

afterEach(cleanup);

describe("AutoplaySwitch", () => {
  it("is a switch, not a pressed button, and states which way it is set", () => {
    // The owner's complaint: the old autoplay control gave no indication of
    // whether it was on or off. aria-pressed on an icon is the same ambiguity
    // for assistive tech; role=switch + aria-checked is the on/off semantic.
    render(<AutoplaySwitch enabled onToggle={() => {}} />);
    const on = screen.getByRole("switch", { name: "Autoplay is on" });
    expect(on.getAttribute("aria-checked")).toBe("true");
    expect(on.getAttribute("aria-pressed")).toBeNull();

    cleanup();
    render(<AutoplaySwitch enabled={false} onToggle={() => {}} />);
    const off = screen.getByRole("switch", { name: "Autoplay is off" });
    expect(off.getAttribute("aria-checked")).toBe("false");
  });

  it("swaps the knob glyph so the state is readable without reading the label", () => {
    const { rerender } = render(<AutoplaySwitch enabled onToggle={() => {}} />);
    expect(screen.getByRole("switch").querySelector("[data-knob-glyph='play']")).not.toBeNull();
    rerender(<AutoplaySwitch enabled={false} onToggle={() => {}} />);
    expect(screen.getByRole("switch").querySelector("[data-knob-glyph='pause']")).not.toBeNull();
  });

  it("toggles on click", () => {
    const onToggle = vi.fn();
    render(<AutoplaySwitch enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("takes an explicit accessible name and a visible label for the end card", () => {
    render(
      <AutoplaySwitch enabled={false} onToggle={() => {}} label="Autoplay next" showText />,
    );
    const sw = screen.getByRole("switch", { name: "Autoplay next" });
    expect(sw.textContent).toContain("Autoplay");
  });

  it("uses the media focus ring", () => {
    render(<AutoplaySwitch enabled onToggle={() => {}} />);
    expect(screen.getByRole("switch").className.split(/\s+/)).toContain("focus-ring-media");
  });
});
