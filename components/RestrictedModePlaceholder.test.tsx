// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RestrictedModePlaceholder } from "./RestrictedModePlaceholder";

afterEach(cleanup);

describe("RestrictedModePlaceholder", () => {
  it("states why the tile is missing", () => {
    render(<RestrictedModePlaceholder />);
    expect(screen.getByText("Hidden by Restricted Mode")).toBeTruthy();
  });

  it("is a centred muted plate by default", () => {
    const { container } = render(<RestrictedModePlaceholder />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.className).toContain("flex items-center justify-center");
    expect(el.className).toContain("bg-surface-muted");
  });

  it("the row variant drops the plate so it does not fight the list rules", () => {
    const { container } = render(<RestrictedModePlaceholder variant="row" />);
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      "bg-surface-muted",
    );
  });

  it("renders as the element the surface needs — a search row is an <li>", () => {
    const { container } = render(<RestrictedModePlaceholder as="li" variant="row" />);
    expect(container.firstElementChild?.tagName).toBe("LI");
  });

  it("keeps each surface's own geometry", () => {
    const { container } = render(
      <RestrictedModePlaceholder className="aspect-video rounded-2xl px-4 text-sm" />,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "aspect-video rounded-2xl px-4 text-sm",
    );
  });
});
