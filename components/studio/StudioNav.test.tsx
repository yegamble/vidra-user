// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/live/availability", () => ({ useLiveAvailable: () => true }));
vi.mock("./StudioContext", () => ({
  useStudio: () => ({ channels: [], currentChannel: null, currentHandle: null, setCurrentHandle: vi.fn() }),
}));

import { StudioNav } from "./StudioNav";

afterEach(cleanup);

describe("StudioNav", () => {
  it("names the review-queue tab 'Comment queue', never the bare stat label 'Comments'", () => {
    // The dashboard and analytics grids label a stat "Comments"; a tab with the
    // same visible text would make every Studio page read it twice.
    render(<StudioNav />);
    expect(screen.getByRole("link", { name: "Comment queue" }).getAttribute("href")).toBe("/studio/comments");
    expect(screen.queryByText("Comments", { exact: true })).toBeNull();
  });
});
