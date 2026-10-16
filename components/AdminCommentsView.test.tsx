// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("AdminCommentsView automatic tags", () => {
  const row = (id: string, tags: string[]) => ({
    id,
    video_id: "v1",
    video_title: "Clip",
    author_username: "mona",
    body: "hello",
    created_at: "2026-07-10T14:30:00Z",
    automatic_tags: tags,
  });
  const page = (comments: unknown[]) => ({ comments, total: comments.length, limit: 10, offset: 0 });

  it("shows each row's automatic tags as chips and none for an untagged row", async () => {
    mocks.getAdminComments.mockResolvedValue(page([row("c1", ["external-link", "Spam words"]), row("c2", [])]));
    render(<AdminCommentsView />);
    expect(await screen.findByText("external-link")).toBeTruthy();
    expect(screen.getByText("Spam words")).toBeTruthy();
    expect(screen.getAllByRole("list", { name: "Automatic tags" })).toHaveLength(1);
  });

  it("keeps the body search's Search button unique beside the tag filter", async () => {
    mocks.getAdminComments.mockResolvedValue(page([]));
    render(<AdminCommentsView />);
    await screen.findByLabelText("Filter by automatic tag");
    expect(screen.getAllByRole("button", { name: "Search" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Filter by tag" })).toBeTruthy();
  });

  it("filters by automatic tag, sends auto_tag, and resets pagination", async () => {
    navigation.reset("/admin/comments", "offset=10");
    mocks.getAdminComments.mockResolvedValue(page([row("c1", ["external-link"])]));
    render(<AdminCommentsView />);
    const box = await screen.findByLabelText("Filter by automatic tag");
    fireEvent.change(box, { target: { value: "external-link" } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => {
      const last = mocks.getAdminComments.mock.calls.at(-1)![0];
      expect(last.auto_tag).toBe("external-link");
      expect(last.offset).toBe(0);
      expect(navigation.params().get("offset")).toBeNull();
    });
  });
});
