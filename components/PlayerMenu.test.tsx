// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PlayerMenu } from "./PlayerMenu";

// The rate ladder is rebuilt on every render by the real callers (SpeedMenu maps
// PLAYBACK_RATES, QualityMenu maps levels), so `items` is a NEW array identity
// each time. This harness reproduces that faithfully — the bug below only
// appears when the array identity churns.
function Harness({ current = 1 }: { current?: number }) {
  const [, bump] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => bump((n) => n + 1)}>
        force rerender
      </button>
      <PlayerMenu
        buttonLabel={`Speed: ${current}×`}
        buttonText={`${current}×`}
        menuLabel="Playback speed"
        variant="overlay"
        icon={<svg aria-hidden="true" />}
        items={[0.5, 1, 2, 4].map((r) => ({ value: r, label: `${r}×` }))}
        current={current}
        onSelect={() => {}}
      />
    </div>
  );
}

afterEach(cleanup);

describe("PlayerMenu", () => {
  it("focuses the checked entry when it opens", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "1×" }));
  });

  it("does not re-grab focus on an unrelated re-render", () => {
    // REGRESSION (mobile speed picker): the focus effect used to depend on
    // [open, items, current]. `items` is a fresh array every render, so ANY
    // re-render re-ran it and pulled focus — and with it the menu's scroll
    // position — back to the checked row. In a browser that made the far end of
    // the ladder unclickable: the menu snapped from 4× back to 1× between
    // pointerdown and mouseup, so the press landed on the menu, not the row.
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));

    const four = screen.getByRole("menuitemradio", { name: "4×" });
    act(() => four.focus());
    expect(document.activeElement).toBe(four);

    act(() => {
      screen.getByRole("button", { name: "force rerender" }).click();
    });

    expect(document.activeElement).toBe(four);
  });

  it("portals the open menu out of its trigger's subtree so no ancestor can clip it", () => {
    // The player stage is `overflow-hidden` and ~185px tall on a phone; an
    // in-stage `absolute` menu had 7 of 12 rungs clipped outside the video.
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));

    const menu = screen.getByRole("menu", { name: "Playback speed" });
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
    expect(menu.style.position).toBe("fixed");
  });

  it("portals into the fullscreen element while the player is fullscreen", () => {
    // Portaling to <body> would put the menu outside the fullscreen element,
    // where nothing is painted — the menu would simply vanish in fullscreen.
    const fs = document.createElement("div");
    document.body.appendChild(fs);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fs,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));

    expect(fs.contains(screen.getByRole("menu", { name: "Playback speed" }))).toBe(true);

    Reflect.deleteProperty(document, "fullscreenElement");
    fs.remove();
  });

  it("keeps a press inside the portaled menu from closing it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));
    const menu = screen.getByRole("menu", { name: "Playback speed" });

    fireEvent.pointerDown(screen.getByRole("menuitemradio", { name: "4×" }));
    expect(document.body.contains(menu)).toBe(true);

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Playback speed" })).toBeNull();
  });
});
