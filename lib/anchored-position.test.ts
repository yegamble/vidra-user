import { describe, expect, it } from "vitest";

import { anchoredPosition } from "./anchored-position";

// A phone-sized viewport with a trigger sitting on the bottom edge of an inline
// 16:9 player — the exact geometry that clipped the player's speed menu (7 of
// its 12 rows rendered above the player's top edge, inside `overflow-hidden`).
const PHONE = { width: 360, height: 740 };

function rect(top: number, left: number, w = 44, h = 44) {
  return { top, left, right: left + w, bottom: top + h };
}

describe("anchoredPosition", () => {
  it("opens below the trigger by default", () => {
    const pos = anchoredPosition(rect(100, 100), { width: 160, height: 120 }, PHONE);
    expect(pos).toEqual({ top: 148, left: 100 }); // bottom (144) + gap 4
  });

  it("flips above when there is not enough room below", () => {
    const pos = anchoredPosition(rect(600, 100), { width: 160, height: 200 }, PHONE);
    expect(pos.top).toBe(600 - 200 - 4);
  });

  it("opens above the trigger when the caller prefers it (the player's control bar)", () => {
    const pos = anchoredPosition(rect(300, 100), { width: 160, height: 200 }, PHONE, {
      prefer: "above",
    });
    expect(pos.top).toBe(300 - 200 - 4);
  });

  it("flips a prefer-above menu back below when the space above cannot hold it", () => {
    // Trigger near the top: only 60px above, 636px below.
    const pos = anchoredPosition(rect(60, 100), { width: 160, height: 200 }, PHONE, {
      prefer: "above",
    });
    expect(pos.top).toBe(104 + 4);
  });

  it("aligns the menu's end edge with the trigger's when asked", () => {
    const pos = anchoredPosition(rect(300, 200), { width: 160, height: 100 }, PHONE, {
      align: "end",
    });
    expect(pos.left).toBe(244 - 160);
  });

  it("flips an end-aligned menu to start when it would run off the left edge", () => {
    const pos = anchoredPosition(rect(300, 10), { width: 160, height: 100 }, PHONE, {
      align: "end",
    });
    expect(pos.left).toBe(10);
  });

  it("clamps a menu that would overflow the right edge back inside the viewport", () => {
    const pos = anchoredPosition(rect(300, 340), { width: 200, height: 100 }, PHONE);
    expect(pos.left).toBe(PHONE.width - 200 - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it("never places the first row off-screen when the menu is taller than the viewport", () => {
    // The regression this helper exists for: a 12-rung speed ladder opened from
    // a control bar inside a 185px-tall player. Clamped, not negative.
    const pos = anchoredPosition(rect(240, 300), { width: 160, height: 900 }, PHONE, {
      prefer: "above",
    });
    expect(pos.top).toBe(8);
    expect(pos.top).toBeGreaterThanOrEqual(0);
  });

  it("keeps a landscape-fullscreen phone menu on screen", () => {
    const landscape = { width: 844, height: 390 };
    const pos = anchoredPosition(rect(330, 780), { width: 160, height: 256 }, landscape, {
      align: "end",
      prefer: "above",
    });
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.top + 256).toBeLessThanOrEqual(390 - 8 + 0.001);
    expect(pos.left + 160).toBeLessThanOrEqual(844 - 8);
  });
});
