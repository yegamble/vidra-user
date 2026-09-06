// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <div>{video.title}</div>,
}));

// The session the rail sees. The default keeps every pre-existing case on the
// settled path they were written for.
let sessionStatus: "restoring" | "anon" | "authed" = "anon";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, user: null }),
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
  sessionStatus = "anon";
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

// The rail is the only surface that reads `personalized`, and on a HARD LOAD it
// was reading it from a request the viewer's session had not reached yet.
// Observed in real Chromium against a live core: loading "/" while signed in
// fired the rail's fetch TWICE — once with the Authorization header and once
// without, because the auth provider re-renders the tree while the refresh
// cookie is being redeemed — and the anonymous answer landed last. The rail
// therefore showed the generic list under "Trending now" on every hard load,
// and the personalized one only after a client-side navigation.
//
// Waiting for the session to settle ("restoring" -> "authed"/"anon") is what
// makes one request go out, with the identity the viewer actually has.
describe("HomeRecommendationsRail session settling", () => {
  it("does not fetch while the session is still restoring", async () => {
    sessionStatus = "restoring";
    getHomeRecommendations.mockResolvedValue({
      items: [item("a", "One")],
      personalized: false,
      source: "search",
    });
    render(<HomeRecommendationsRail />);
    await new Promise((r) => setTimeout(r, 20));
    expect(getHomeRecommendations).not.toHaveBeenCalled();
  });

  it("fetches once the session has settled", async () => {
    sessionStatus = "authed";
    getHomeRecommendations.mockResolvedValue({
      items: [item("a", "One")],
      personalized: true,
      source: "search",
    });
    render(<HomeRecommendationsRail />);
    expect(await screen.findByRole("heading", { name: "For you" })).toBeTruthy();
    expect(getHomeRecommendations).toHaveBeenCalledTimes(1);
  });
});
