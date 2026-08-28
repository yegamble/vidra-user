// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

afterEach(cleanup);

describe("PageHeader", () => {
  it("names the page with a level-1 heading", () => {
    render(<PageHeader title="Watched words" />);
    expect(screen.getByRole("heading", { level: 1, name: "Watched words" })).toBeTruthy();
  });

  it("renders the description under the title", () => {
    render(<PageHeader title="Jobs" description="Queue health plus execution history." />);
    expect(screen.getByText("Queue health plus execution history.")).toBeTruthy();
  });

  it("omits the description paragraph entirely when there is none", () => {
    const { container } = render(<PageHeader title="Jobs" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("renders the `above` slot before the title — the section switcher and back link live there", () => {
    const { container } = render(
      <PageHeader above={<nav aria-label="Admin sections" />} title="Users" />,
    );
    const header = container.firstElementChild as HTMLElement;
    expect(header.children[0].tagName).toBe("NAV");
    expect(header.children[1].tagName).toBe("H1");
  });

  it("introduces no <main> — every route owns its own, and e2e asserts exactly one", () => {
    const { container } = render(<PageHeader title="Reports" description="Abuse reports." />);
    expect(container.querySelectorAll("main")).toHaveLength(0);
    expect(container.firstElementChild?.tagName).toBe("HEADER");
  });
});
