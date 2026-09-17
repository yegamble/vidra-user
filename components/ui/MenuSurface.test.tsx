// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dropdown } from "./Dropdown";
import { PlayerMenu } from "@/components/PlayerMenu";
import { PlayerOverflowMenu } from "@/components/player/PlayerOverflowMenu";

const cases = [
  { name: "card actions", trigger: "Actions", node: <Dropdown trigger="Actions" triggerLabel="Actions" items={[{ label: "Choose", onSelect: () => {} }]} /> },
  { name: "quality choices", trigger: "Quality", node: <PlayerMenu buttonLabel="Quality" menuLabel="Quality" icon={null} items={[{ value: "auto", label: "Auto" }]} current="auto" onSelect={() => {}} /> },
  { name: "player settings", trigger: "Settings", node: <PlayerOverflowMenu toggles={[{ id: "autoplay", label: "Autoplay", pressed: true, onToggle: () => {} }]} groups={[]} /> },
];
afterEach(cleanup);

describe.each(cases)("$name shared menu contract", ({ trigger, node }) => {
  function open() {
    const view = render(node);
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    return { ...view, menu: screen.getByRole("menu") };
  }
  it("uses the shared themed surface outside the clipping subtree", () => {
    const { container, menu } = open();
    expect(menu.classList.contains("menu-surface")).toBe(true);
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
  });
  it("keeps inside presses open and closes outside the portal", () => {
    const { menu } = open();
    fireEvent.pointerDown(menu);
    expect(screen.getByRole("menu")).toBe(menu);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("closes on Escape and restores the trigger focus", () => {
    const { menu } = open();
    const row = menu.querySelector<HTMLElement>('[role^="menuitem"]')!;
    row.focus();
    fireEvent.keyDown(row, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: trigger }));
  });
});
