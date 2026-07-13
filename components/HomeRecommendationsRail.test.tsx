// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <div>{video.title}</div>,
}));

const trackSearchEvent = vi.fn();
vi.mock("@/lib/search-events", () => ({
  trackSearchEvent: (...args: unknown[]) => trackSearchEvent(...args),
}));

vi.mock("@/lib/api", () => ({
  api: { getHomeRecommendations: vi.fn() },
}));

// jsdom has no IntersectionObserver; the impression observer must degrade to a
// no-op (rail still renders). Provide a minimal stub so the effect binds cleanly.
class MockIO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", MockIO);

import { api } from "@/lib/api";
import { HomeRecommendationsRail } from "./HomeRecommendationsRail";

const getHomeRecommendations = vi.mocked(api.getHomeRecommendations);

function item(id: string, title: string) {
  return { id, title, has_thumbnail: false } as never;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HomeRecommendationsRail", () => {
  it("renders nothing when the endpoint returns no items", async () => {
    getHomeRecommendations.mockResolvedValue({ items: [], personalized: false, source: "fallback" });
    const { container } = render(<HomeRecommendationsRail />);
    await waitFor(() => expect(getHomeRecommendations).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders nothing when the endpoint fails", async () => {
    getHomeRecommendations.mockRejectedValue(new Error("boom"));
    const { container } = render(<HomeRecommendationsRail />);
    await waitFor(() => expect(getHomeRecommendations).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("labels the rail 'For you' when the server reports personalized", async () => {
    getHomeRecommendations.mockResolvedValue({
      items: [item("a", "One"), item("b", "Two")],
      personalized: true,
      source: "search",
    });
    render(<HomeRecommendationsRail />);
    expect(await screen.findByRole("heading", { name: "For you" })).toBeTruthy();
    expect(screen.getByText("One")).toBeTruthy();
    expect(screen.getByText("Two")).toBeTruthy();
  });

  it("labels the rail 'Trending now' for the non-personalized fallback", async () => {
    getHomeRecommendations.mockResolvedValue({
      items: [item("a", "Popular clip")],
      personalized: false,
      source: "fallback",
    });
    render(<HomeRecommendationsRail />);
    expect(await screen.findByRole("heading", { name: "Trending now" })).toBeTruthy();
  });
});
