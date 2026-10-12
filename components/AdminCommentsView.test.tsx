// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminComments: vi.fn() }));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({
  api: { getAdminComments: mocks.getAdminComments },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { AdminCommentsView } from "@/components/AdminCommentsView";
import { navigation } from "@/lib/test-navigation";

beforeEach(() => {
  navigation.reset("/admin/comments");
  mocks.getAdminComments.mockReset();
});
afterEach(cleanup);

describe("AdminCommentsView body rendering", () => {
  it("renders a markdown link as a safe anchor and keeps a javascript: link inert", async () => {
    mocks.getAdminComments.mockResolvedValue({
      comments: [
        {
          id: "c1",
          video_id: "v1",
          video_title: "Clip",
          author_username: "mona",
          body: "[ok](https://e.test/a) and [bad](javascript:alert(1)) at 1:23",
          created_at: "2026-07-10T14:30:00Z",
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
    const { container } = render(<AdminCommentsView />);
    const link = await screen.findByRole("link", { name: "ok" });
    expect(link.getAttribute("href")).toBe("https://e.test/a");
    expect(link.getAttribute("rel")).toBe("nofollow noopener noreferrer ugc");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.textContent).toContain("bad");
    // ?t= links would only reload the admin page.
    expect(container.querySelector("a[data-timestamp-seconds]")).toBeNull();
  });
});
