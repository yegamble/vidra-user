// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IconTile } from "./IconTile";

afterEach(cleanup);

describe("IconTile", () => {
  it("renders a colored tile holding a white glyph, decorative by default", () => {
    const { container } = render(
      <IconTile color="blue">
        <svg data-testid="glyph" />
      </IconTile>,
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.className).toContain("bg-tile-blue");
    expect(tile.className).toContain("text-white");
    // Supporting decoration — the adjacent row label carries the meaning.
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("glyph")).toBeTruthy();
  });

  it("maps each palette color to its tile token", () => {
    const { container } = render(
      <IconTile color="pink">
        <svg />
      </IconTile>,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain("bg-tile-pink");
  });

  it("becomes an accessible image when it stands alone", () => {
    render(
      <IconTile color="green" label="Connections">
        <svg />
      </IconTile>,
    );
    const el = screen.getByRole("img", { name: "Connections" });
    expect(el.getAttribute("aria-hidden")).toBeNull();
  });
});
