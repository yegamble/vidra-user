// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OverlayButton } from "./OverlayButton";
import { PlayerTipProvider, PlayerTooltipLayer, usePlayerTooltip } from "./PlayerTooltip";

function Harness({ label = "Play" }: { label?: string }) {
  const { handle, tip, anchorRef } = usePlayerTooltip();
  return (
    <PlayerTipProvider value={handle}>
      <PlayerTooltipLayer tip={tip} anchorRef={anchorRef} />
      <OverlayButton label={label} tipKeys="K" />
      <OverlayButton label="Mute" tipKeys="M" />
    </PlayerTipProvider>
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PlayerTooltip", () => {
  it("shows the hovered control and shortcut immediately, without a dwell timer", () => {
    render(<Harness />);
    const play = screen.getByRole("button", { name: "Play" });
    fireEvent.pointerEnter(play);
    const tip = screen.getByTestId("player-tooltip");
    expect(tip.textContent).toContain("Play");
    expect(within(tip).getByText("K").tagName).toBe("KBD");
    fireEvent.pointerLeave(play);
    expect(screen.queryByTestId("player-tooltip")).toBeNull();
  });

  it("recovers a pointer already over a hydrated control immediately", () => {
    render(<Harness />);
    fireEvent.pointerMove(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByTestId("player-tooltip").textContent).toContain("Play");
  });

  it("keeps one bubble current when controls change or the pointer moves between them", () => {
    const { rerender } = render(<Harness />);
    const play = screen.getByRole("button", { name: "Play" });
    fireEvent.pointerEnter(play);
    rerender(<Harness label="Pause" />);
    expect(screen.getByTestId("player-tooltip").textContent).toContain("Pause");
    fireEvent.pointerLeave(play);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Mute" }));
    expect(screen.getAllByTestId("player-tooltip")).toHaveLength(1);
    expect(screen.getByTestId("player-tooltip").textContent).toBe("MuteM");
  });

  it("suppresses touch hover while keeping keyboard focus tooltips immediate", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<Harness />);
    const play = screen.getByRole("button", { name: "Play" });
    fireEvent.pointerEnter(play);
    expect(screen.queryByTestId("player-tooltip")).toBeNull();
    fireEvent.focus(play);
    expect(screen.getByTestId("player-tooltip").textContent).toBe("PlayK");
    fireEvent.blur(play);
    expect(screen.queryByTestId("player-tooltip")).toBeNull();
  });
});
