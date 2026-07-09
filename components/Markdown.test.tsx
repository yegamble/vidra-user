// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders headings, emphasis, and lists from markdown", () => {
    render(<Markdown>{"## Our mission\n\nBe **kind**.\n\n- one\n- two"}</Markdown>);
    expect(screen.getByRole("heading", { name: "Our mission", level: 2 })).toBeTruthy();
    expect(screen.getByText("kind").tagName).toBe("STRONG");
    expect(screen.getByRole("list").tagName).toBe("UL");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders links opening safely in a new tab", () => {
    render(<Markdown>{"[docs](https://example.test/docs)"}</Markdown>);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("href")).toBe("https://example.test/docs");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("supports GFM tables and strikethrough", () => {
    const { container } = render(
      <Markdown>{"| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~"}</Markdown>,
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "2" })).toBeTruthy();
    expect(container.querySelector("del")?.textContent).toBe("gone");
  });

  it("never turns raw HTML into elements (no rehype-raw by design)", () => {
    const { container } = render(
      <Markdown>{'before <script>window.x = 1</script><b onclick="x()">bold</b> after'}</Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    // The surrounding markdown text still renders.
    expect(screen.getByText(/before/)).toBeTruthy();
  });

  it("styles inline code with tokens", () => {
    render(<Markdown>{"run `npm test` locally"}</Markdown>);
    const code = screen.getByText("npm test");
    expect(code.tagName).toBe("CODE");
    expect(code.className).toContain("bg-surface-muted");
  });
});
