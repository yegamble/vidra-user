// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FederatedOriginBadge } from "./FederatedOriginBadge";

afterEach(cleanup);

describe("FederatedOriginBadge", () => {
  it("announces the host as a sentence, not a naked domain", () => {
    render(<FederatedOriginBadge domain="videos.example" />);
    expect(screen.getByText("From")).toBeTruthy();
    expect(screen.getByText("videos.example")).toBeTruthy();
  });

  it("draws one globe from the shared icon set", () => {
    const { container } = render(<FederatedOriginBadge domain="videos.example" />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(1);
    // Decorative: the `sr-only` prefix already names the pill.
    expect(svgs[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the native tooltip the remote-video e2e specs locate it by", () => {
    render(
      <FederatedOriginBadge
        variant="ribbon"
        domain="videos.example"
        title="Federated video from videos.example"
      />,
    );
    expect(screen.getByTitle("Federated video from videos.example")).toBeTruthy();
  });

  it("sizes the plain pill from the size prop, not from a className override", () => {
    const { container, rerender } = render(<FederatedOriginBadge domain="a.example" />);
    const pill = () => container.firstElementChild as HTMLElement;
    expect(pill().className).toContain("px-2 py-0.5 text-[11px] font-medium");
    rerender(<FederatedOriginBadge domain="a.example" size="md" />);
    expect(pill().className).toContain("px-2.5 py-0.5 text-xs font-semibold");
  });

  it("truncates by default and lets the watch header opt out", () => {
    const { container, rerender } = render(<FederatedOriginBadge domain="a.example" />);
    expect(screen.getByText("a.example").className).toContain("truncate");
    // Opted out, the host is bare text on the pill — no wrapper span to clip it.
    rerender(<FederatedOriginBadge domain="a.example" truncate={false} />);
    expect(container.querySelector(".truncate")).toBeNull();
    expect(container.textContent).toContain("a.example");
  });

  // The protocol label is a SIBLING pill, so it stays its own chip in the
  // parent's flex row rather than being swallowed by the origin capsule.
  it("emits the ActivityPub label beside the pill when asked", () => {
    const { container } = render(<FederatedOriginBadge domain="a.example" withProtocol />);
    expect(screen.getByText("ActivityPub")).toBeTruthy();
    expect(container.children.length).toBe(2);
  });

  it("omits the protocol label by default", () => {
    render(<FederatedOriginBadge domain="a.example" />);
    expect(screen.queryByText("ActivityPub")).toBeNull();
  });
});
