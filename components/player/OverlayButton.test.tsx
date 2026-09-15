// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OverlayButton } from "./OverlayButton";

afterEach(cleanup);

describe("OverlayButton", () => {
  it("keeps the accessible name but drops the native title", () => {
    // The bar draws its own tooltip above the controls now. Leaving `title` on
    // would double up: the browser's yellow bubble under the pointer AND the
    // player's label above the bar, from the same hover.
    render(<OverlayButton label="Captions">x</OverlayButton>);
    const button = screen.getByRole("button", { name: "Captions" });
    expect(button.getAttribute("title")).toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Captions");
  });

  it("marks a pressed toggle with the on-indicator underline", () => {
    // aria-pressed is the semantic; the underline is what a SIGHTED viewer reads
    // (the owner's complaint was that an on toggle looked identical to an off one).
    const { rerender } = render(
      <OverlayButton label="Captions" pressed={false}>
        x
      </OverlayButton>,
    );
    expect(screen.getByRole("button").querySelector("[data-on-indicator]")).toBeNull();
    rerender(
      <OverlayButton label="Captions" pressed>
        x
      </OverlayButton>,
    );
    expect(screen.getByRole("button").querySelector("[data-on-indicator]")).not.toBeNull();
  });

  it("uses the media focus ring, never the app's accent ring", () => {
    // The accent ring is a themed token; over video it has to be a white glow
    // (the design-system media-overlay exception).
    render(<OverlayButton label="Play">x</OverlayButton>);
    const classes = screen.getByRole("button").className.split(/\s+/);
    expect(classes).toContain("focus-ring-media");
    expect(classes).not.toContain("focus-ring");
  });
});
