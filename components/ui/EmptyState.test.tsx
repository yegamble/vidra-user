// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders the title and message with no dashed border", () => {
    const { container } = render(<EmptyState title="Nothing yet" message="Come back later" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Come back later")).toBeTruthy();
    // The redesign drops the dashed border.
    expect((container.firstElementChild as HTMLElement).className).not.toContain("border-dashed");
  });

  it("leads with an accent tinted-circle icon when one is passed", () => {
    render(
      <EmptyState
        title="No playlists"
        icon={<svg data-testid="glyph" />}
      />,
    );
    const glyph = screen.getByTestId("glyph");
    const circle = glyph.parentElement as HTMLElement;
    expect(circle.className).toContain("rounded-full");
    expect(circle.className).toContain("bg-accent/12");
    expect(circle.className).toContain("text-accent");
    // Decorative (the title carries the meaning).
    expect(circle.getAttribute("aria-hidden")).toBe("true");
  });

  it("honors a tile tint override on the icon circle", () => {
    render(<EmptyState title="No devices" tint="teal" icon={<svg data-testid="g" />} />);
    const circle = screen.getByTestId("g").parentElement as HTMLElement;
    expect(circle.className).toContain("bg-tile-teal/12");
    expect(circle.className).toContain("text-tile-teal");
  });
});
