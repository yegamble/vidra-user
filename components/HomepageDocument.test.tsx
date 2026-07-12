// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomepageDocument } from "./HomepageDocument";

afterEach(cleanup);

describe("HomepageDocument", () => {
  it("renders the operator markdown through the sanitized pipeline", () => {
    render(
      <HomepageDocument body={"# Welcome\n\nBe **excellent**. <script>window.x=1</script>"} />,
    );
    // Markdown becomes elements…
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeTruthy();
    expect(screen.getByText("excellent").tagName).toBe("STRONG");
    // …raw HTML never does (the app's one markdown renderer).
    expect(document.querySelector("article script")).toBeNull();
  });

  it("keeps the feed reachable with an explicit browse link (params win over landing)", () => {
    render(<HomepageDocument body={"# Hi"} />);
    const browse = screen.getByRole("link", { name: "Browse videos" });
    expect(browse.getAttribute("href")).toBe("/?sort=recent");
  });
});
