// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AmbientGlow } from "./AmbientGlow";

afterEach(cleanup);

describe("AmbientGlow", () => {
  it("renders a decorative, blurred poster copy behind the player when a poster exists", () => {
    const { container } = render(<AmbientGlow posterUrl="https://cdn.example/poster.jpg" />);

    const glow = container.querySelector('[data-testid="ambient-glow"]');
    expect(glow).not.toBeNull();
    // Purely decorative — never in the accessibility tree.
    expect(glow?.getAttribute("aria-hidden")).toBe("true");
    // The blurred layer paints the poster as a background image (no second <img>).
    const layer = glow?.querySelector("div");
    expect(layer?.getAttribute("style")).toContain('url("https://cdn.example/poster.jpg")');
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing when the video has no poster", () => {
    const { container } = render(<AmbientGlow posterUrl={null} />);
    expect(container.querySelector('[data-testid="ambient-glow"]')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
