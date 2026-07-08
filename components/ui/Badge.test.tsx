// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Badge } from "./Badge";

afterEach(cleanup);

describe("Badge", () => {
  it("defaults to the neutral sentence-case pill", () => {
    render(<Badge>Unlisted</Badge>);
    const el = screen.getByText("Unlisted");
    expect(el.className).toContain("bg-surface-muted");
    expect(el.className).toContain("text-xs");
    expect(el.className).not.toContain("uppercase");
  });

  it("applies the uppercase micro status style", () => {
    render(
      <Badge variant="success" status>
        Published
      </Badge>,
    );
    const el = screen.getByText("Published");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("text-[10.5px]");
    expect(el.className).toContain("text-success");
  });

  it("renders the ADMIN inverse role pill", () => {
    render(
      <Badge variant="inverse" status>
        Admin
      </Badge>,
    );
    const el = screen.getByText("Admin");
    expect(el.className).toContain("bg-fg");
    expect(el.className).toContain("text-canvas");
  });

  it("renders the MOD strong-fill role pill", () => {
    render(
      <Badge variant="strong" status>
        Mod
      </Badge>,
    );
    const el = screen.getByText("Mod");
    expect(el.className).toContain("bg-surface-strong");
    expect(el.className).toContain("text-fg-muted");
  });
});
