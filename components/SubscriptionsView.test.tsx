// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSubscriptionVideos: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getSubscriptionVideos: mocks.getSubscriptionVideos },
}));
vi.mock("@/components/RemoteFollowsSection", () => ({ RemoteFollowsSection: () => null }));
vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <span>{video.title}</span>,
}));

import { SubscriptionsView } from "./SubscriptionsView";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `v${from + i}`, title: `Sub ${from + i}` }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SubscriptionsView paging", () => {
  it("loads page 2 at offset 20, appends it, and hides Load more at the total", async () => {
    mocks.getSubscriptionVideos.mockImplementation((p: { offset?: number }) =>
      Promise.resolve(
        p.offset
          ? { videos: rows(20, 3), total: 23, limit: 20, offset: 20 }
          : { videos: rows(0, 20), total: 23, limit: 20, offset: 0 },
      ),
    );
    render(<SubscriptionsView />);
    await screen.findByText("Sub 0");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Sub 22")).toBeTruthy();
    expect(screen.getByText("Sub 0")).toBeTruthy();
    expect(mocks.getSubscriptionVideos).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 20, offset: 20 }),
      expect.anything(),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});
