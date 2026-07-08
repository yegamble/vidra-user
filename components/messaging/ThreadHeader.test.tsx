// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Report affordance pulls in the session context; stub it out — this test
// covers the header's own identity/status rendering, not reporting.
vi.mock("@/components/ReportButton", () => ({
  ReportButton: () => null,
}));

import { ThreadHeader } from "./ThreadHeader";

afterEach(cleanup);

describe("ThreadHeader", () => {
  it("shows the E2EE success status line (and omits the aspirational TTL copy)", () => {
    render(<ThreadHeader name="Grade House" otherUserId="u2" encrypted />);
    expect(screen.getByText("End-to-end encrypted")).toBeTruthy();
    // The design's "· disappearing 7d" suffix is aspirational (no TTL contract).
    expect(screen.queryByText(/disappearing/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Back to messages" })).toBeTruthy();
  });

  it("shows the peer's @handle on an unencrypted thread and no E2EE line", () => {
    render(
      <ThreadHeader name="Bob Builder" username="bob" otherUserId="u2" encrypted={false} />,
    );
    expect(screen.getByRole("heading", { name: "Bob Builder" })).toBeTruthy();
    expect(screen.getByText("@bob")).toBeTruthy();
    expect(screen.queryByText("End-to-end encrypted")).toBeNull();
  });
});
