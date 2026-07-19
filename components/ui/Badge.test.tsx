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

  it("renders the protocol variant as a brand tint + dot with a neutral label", () => {
    render(
      <Badge variant="protocol" protocol="bluesky">
        Bluesky
      </Badge>,
    );
    const el = screen.getByText("Bluesky");
    // Brand tint fill, but the label stays `fg` (the teal/blue hues fail AA as text).
    expect(el.className).toContain("bg-protocol-bluesky/12");
    expect(el.className).toContain("text-fg");
    // A full-strength brand dot carries the color; it is decorative.
    const dot = el.querySelector("span[aria-hidden]");
    expect(dot?.className).toContain("bg-protocol-bluesky");
  });

  it("renders the federated-origin variant wearing the protocol ribbon on its top edge", () => {
    render(<Badge variant="federated">peertube.example</Badge>);
    const el = screen.getByText("peertube.example");
    expect(el.className).toContain("bg-surface-muted");
    // The tri-protocol ribbon rides the top edge (placement c) — decorative.
    const ribbon = el.querySelector(".protocol-ribbon");
    expect(ribbon).not.toBeNull();
    expect(ribbon?.getAttribute("aria-hidden")).toBe("true");
  });
});
