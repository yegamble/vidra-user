import { afterEach, describe, expect, it, vi } from "vitest";

const { getUnreadNotificationCount } = vi.hoisted(() => ({ getUnreadNotificationCount: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { getUnreadNotificationCount } }));

import { fetchUnreadNotificationCount } from "./unread-notification-count";

afterEach(() => getUnreadNotificationCount.mockReset());

describe("fetchUnreadNotificationCount", () => {
  // The header bell and the bottom tab bar both refresh the count on every
  // navigation; they must share one request, not each spend the API budget.
  it("shares one in-flight request between callers for the same navigation", async () => {
    getUnreadNotificationCount.mockResolvedValue({ unread_count: 4 });
    const [a, b] = await Promise.all([fetchUnreadNotificationCount("/x"), fetchUnreadNotificationCount("/x")]);
    expect([a, b]).toEqual([4, 4]);
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1);
  });

  it("fetches again on the next navigation, and after the previous one settled", async () => {
    getUnreadNotificationCount.mockResolvedValue({ unread_count: 1 });
    await fetchUnreadNotificationCount("/a");
    await fetchUnreadNotificationCount("/b");
    await fetchUnreadNotificationCount("/b");
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(3);
  });

  it("lets a failure reach every caller and does not cache it", async () => {
    getUnreadNotificationCount.mockRejectedValueOnce(new Error("429"));
    const results = await Promise.allSettled([fetchUnreadNotificationCount("/e"), fetchUnreadNotificationCount("/e")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    getUnreadNotificationCount.mockResolvedValue({ unread_count: 0 });
    await expect(fetchUnreadNotificationCount("/e")).resolves.toBe(0);
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2);
  });
});
