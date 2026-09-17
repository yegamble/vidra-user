// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlayerOverflowMenu", () => {
  function open() {
    render(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    return screen.getByRole("menu", { name: "Settings" });
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
    expect(screen.queryByRole("menuitemradio")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /Playback speed/ }));
    const group = screen.getByRole("menu", { name: "Playback speed" });
    expect(group.querySelectorAll('[role="menuitemradio"]')).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "1×" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("invokes the toggle and closes", () => {
    open();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Mute" }));
    expect(TOGGLES[0].onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "Settings" })).toBeNull();
  });

  it("selects a choice by its value and closes", () => {
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /Playback speed/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "4×" }));
    expect(GROUPS[0].onSelect).toHaveBeenCalledWith("4");
    expect(screen.queryByRole("menu", { name: "Settings" })).toBeNull();
  });

  it("portals out of its trigger's subtree so the player stage cannot clip it", () => {
    // The stage is `overflow-hidden` and ~185px tall on a phone; this menu is
    // taller than that by design, so it must not live inside it.
    const { container } = render(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const menu = screen.getByRole("menu", { name: "Settings" });
    expect(container.contains(menu)).toBe(false);
    expect(menu.style.position).toBe("fixed");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    open();
    fireEvent.keyDown(screen.getByRole("menuitemcheckbox", { name: "Mute" }), { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Settings" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Settings" }),
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
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Playback speed/ }));

    // And wrap from the first row back to the last.
    fireEvent.keyDown(mute, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Playback speed/ }));
  });
});


describe("Settings submenus", () => {
  it("returns to the complete root menu when the active group disappears", () => {
    const audio = { id: "audio", label: "Audio track", value: "en", items: [{ value: "en", label: "English" }], onSelect: vi.fn() };
    const { rerender } = render(<PlayerOverflowMenu toggles={TOGGLES} groups={[...GROUPS, audio]} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Audio track/ }));
    expect(screen.getByRole("menu", { name: "Audio track" })).toBeTruthy();
    rerender(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    expect(screen.getByRole("menu", { name: "Settings" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitemcheckbox", { name: "Mute" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Playback speed/ }));
    expect(screen.getByRole("menu", { name: "Playback speed" })).toBeTruthy();
  });

  it("repositions after async content growth without taking keyboard focus", () => {
    let resize = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = observe;
      disconnect = disconnect;
      constructor(callback: () => void) { resize = callback; }
    });
    let height = 200;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    const { rerender } = render(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    const trigger = screen.getByRole("button", { name: "Settings" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: 700, bottom: 744, left: 556, right: 600, width: 44, height: 44, x: 556, y: 700, toJSON() {} });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Settings" });
    expect(menu.style.top).toBe("496px");
    const speed = screen.getByRole("menuitem", { name: /Playback speed/ });
    act(() => speed.focus());
    height = 400;
    rerender(<PlayerOverflowMenu toggles={TOGGLES} groups={[...GROUPS, { ...GROUPS[0], id: "extra", label: "New options" }]} />);
    act(() => resize());
    expect(menu.style.top).toBe("296px");
    expect(document.activeElement).toBe(speed);
    expect(observe).toHaveBeenCalledWith(menu);
    fireEvent.keyDown(speed, { key: "Escape" });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("returns focus to a group after navigating back, then closes on Escape", () => {
    render(<PlayerOverflowMenu toggles={TOGGLES} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Playback speed/ }));
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "1×" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Playback speed/ }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings" }));
  });
  it("opens a subtitle language submenu and applies the selected language", () => {
    const onSelect = vi.fn();
    render(<PlayerOverflowMenu toggles={[]} groups={[{
      id: "subtitles", label: "Subtitles/CC", value: "off", items: [{ value: "off", label: "Off" }], onSelect: vi.fn(),
      groups: [{ id: "language", label: "Language", value: "en", items: [{ value: "en", label: "English" }, { value: "es", label: "Spanish" }], onSelect }],
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Subtitles/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Language/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Spanish" }));
    expect(onSelect).toHaveBeenCalledWith("es");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
