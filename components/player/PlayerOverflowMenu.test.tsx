// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerOverflowMenu } from "./PlayerOverflowMenu";

const TOGGLES = [
  { id: "mute", label: "Mute", pressed: false, onToggle: vi.fn() },
  { id: "theater", label: "Theater mode", pressed: true, onToggle: vi.fn() },
];
const GROUPS = [
  {
    id: "speed",
    label: "Playback speed",
    value: "1",
    items: [
      { value: "0.5", label: "0.5×" },
      { value: "1", label: "1×" },
      { value: "4", label: "4×" },
    ],
    onSelect: vi.fn(),
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlayerOverflowMenu", () => {
  function open() {
    render(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More player options" }));
    return screen.getByRole("menu", { name: "More player options" });
  }

  it("renders nothing when it has no contents", () => {
    const { container } = render(<PlayerOverflowMenu toggles={[]} groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("exposes toggles as menuitemcheckbox with their pressed state", () => {
    const menu = open();
    expect(menu.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(2);
    expect(screen.getByRole("menuitemcheckbox", { name: "Mute" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Theater mode" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("exposes graded choices as a labelled radio group with the current value checked", () => {
    open();
    const group = screen.getByRole("group", { name: "Playback speed" });
    expect(group.querySelectorAll('[role="menuitemradio"]')).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "1×" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("invokes the toggle and closes", () => {
    open();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Mute" }));
    expect(TOGGLES[0].onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "More player options" })).toBeNull();
  });

  it("selects a choice by its value and closes", () => {
    open();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "4×" }));
    expect(GROUPS[0].onSelect).toHaveBeenCalledWith("4");
    expect(screen.queryByRole("menu", { name: "More player options" })).toBeNull();
  });

  it("portals out of its trigger's subtree so the player stage cannot clip it", () => {
    // The stage is `overflow-hidden` and ~185px tall on a phone; this menu is
    // taller than that by design, so it must not live inside it.
    const { container } = render(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More player options" }));
    const menu = screen.getByRole("menu", { name: "More player options" });
    expect(container.contains(menu)).toBe(false);
    expect(menu.style.position).toBe("fixed");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    open();
    fireEvent.keyDown(screen.getByRole("menuitemcheckbox", { name: "Mute" }), { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "More player options" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "More player options" }),
    );
  });

  it("cycles focus across groups with the arrow keys, treating every row as one list", () => {
    open();
    const mute = screen.getByRole("menuitemcheckbox", { name: "Mute" });
    expect(document.activeElement).toBe(mute);

    fireEvent.keyDown(mute, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemcheckbox", { name: "Theater mode" }));

    // Crossing from the toggles into the radio group must work like one menu.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "0.5×" }));

    // And wrap from the first row back to the last.
    fireEvent.keyDown(mute, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "4×" }));
  });
});
