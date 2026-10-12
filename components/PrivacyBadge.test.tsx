// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PrivacyBadge } from "./PrivacyBadge";

afterEach(cleanup);

describe("PrivacyBadge", () => {
  it("labels an internal video and says who can see it", () => {
    render(<PrivacyBadge privacy="internal" />);
    expect(screen.getByText("internal").className).toContain("capitalize");
    expect(screen.getByText(/only people signed in to this instance can see this/i)).toBeTruthy();
  });

  it("renders nothing for a public video", () => {
    const { container } = render(<PrivacyBadge privacy="public" />);
    expect(container.textContent).toBe("");
  });
});
