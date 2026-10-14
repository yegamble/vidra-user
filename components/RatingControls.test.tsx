// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoRating } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let session: { status: string };
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session }));

const getVideoRating = vi.fn();
const setVideoRating = vi.fn();
const clearVideoRating = vi.fn();
const getRemoteVideoRating = vi.fn();
const setRemoteVideoRating = vi.fn();
const clearRemoteVideoRating = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    getVideoRating: (...args: unknown[]) => getVideoRating(...args),
    setVideoRating: (...args: unknown[]) => setVideoRating(...args),
    clearVideoRating: (...args: unknown[]) => clearVideoRating(...args),
    getRemoteVideoRating: (...args: unknown[]) => getRemoteVideoRating(...args),
    setRemoteVideoRating: (...args: unknown[]) => setRemoteVideoRating(...args),
    clearRemoteVideoRating: (...args: unknown[]) => clearRemoteVideoRating(...args),
  },
}));

import { RatingControls, remoteRatingAdapter } from "./RatingControls";

function rating(over: Partial<VideoRating> = {}): VideoRating {
  return { like_count: 0, dislike_count: 0, my_rating: null, ...over } as VideoRating;
}

beforeEach(() => {
  session = { status: "authed" };
  getVideoRating.mockReset();
  setVideoRating.mockReset();
  clearVideoRating.mockReset();
  getRemoteVideoRating.mockReset();
  setRemoteVideoRating.mockReset();
  clearRemoteVideoRating.mockReset();
});

afterEach(cleanup);

describe("RatingControls", () => {
  it("shows the counts and the viewer's own rating as pressed", async () => {
    getVideoRating.mockResolvedValue(rating({ like_count: 3, dislike_count: 1, my_rating: "like" }));
    render(<RatingControls videoId="v1" />);

    const like = await screen.findByLabelText("Like");
    expect(like.getAttribute("aria-pressed")).toBe("true");
    expect(like.textContent).toContain("3");
    expect(screen.getByLabelText("Dislike").getAttribute("aria-pressed")).toBe("false");
  });

  it("flips a like to a dislike and adopts the server's fresh summary", async () => {
    getVideoRating.mockResolvedValue(rating({ like_count: 3, dislike_count: 1, my_rating: "like" }));
    setVideoRating.mockResolvedValue(
      rating({ like_count: 2, dislike_count: 2, my_rating: "dislike" }),
    );
    render(<RatingControls videoId="v1" />);

    fireEvent.click(await screen.findByLabelText("Dislike"));

    await waitFor(() =>
      expect(screen.getByLabelText("Dislike").getAttribute("aria-pressed")).toBe("true"),
    );
    expect(setVideoRating).toHaveBeenCalledWith("v1", "dislike");
    expect(screen.getByLabelText("Like").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("Like").textContent).toContain("2");
  });

  it("clears the rating when the held value is clicked again", async () => {
    getVideoRating.mockResolvedValue(rating({ like_count: 3, my_rating: "like" }));
    clearVideoRating.mockResolvedValue(rating({ like_count: 2, my_rating: null }));
    render(<RatingControls videoId="v1" />);

    fireEvent.click(await screen.findByLabelText("Like"));

    await waitFor(() => expect(clearVideoRating).toHaveBeenCalledWith("v1"));
    expect(screen.getByLabelText("Like").getAttribute("aria-pressed")).toBe("false");
    expect(setVideoRating).not.toHaveBeenCalled();
  });

  it("offers an anonymous visitor a sign-in link and disabled controls", async () => {
    session = { status: "anon" };
    getVideoRating.mockResolvedValue(rating({ like_count: 5, dislike_count: 2, my_rating: null }));
    render(<RatingControls videoId="v1" />);

    const like = await screen.findByLabelText("Like");
    expect((like as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Sign in to rate")).toBeTruthy();
    fireEvent.click(like);
    expect(setVideoRating).not.toHaveBeenCalled();
  });

  // The summary's `my_rating` is PER VIEWER and resolved by the server from the
  // request's bearer token: GET /videos/{id}/rating only knows who is asking if
  // the request carries one. Firing on mount sent it anonymously — the access
  // token is restored asynchronously from the refresh cookie — so on every hard
  // reload of the watch page the server answered `my_rating: null` and the
  // viewer's own like rendered UNPRESSED, exactly as if they had never rated.
  // The effect never re-ran, so it stayed wrong until a client-side navigation.
  // (Same failure shape as CommentsSection's anonymous comment read.)
  it("does not read the summary until the session has resolved", async () => {
    session = { status: "restoring" };
    getVideoRating.mockResolvedValue(rating({ like_count: 3, my_rating: "like" }));
    const { rerender } = render(<RatingControls videoId="v1" />);

    expect(getVideoRating).not.toHaveBeenCalled();

    session = { status: "authed" };
    rerender(<RatingControls videoId="v1" />);

    const like = await screen.findByLabelText("Like");
    expect(like.getAttribute("aria-pressed")).toBe("true");
    expect(getVideoRating).toHaveBeenCalledTimes(1);
  });

  it("reads once for an anonymous visitor, after the restore attempt settles", async () => {
    session = { status: "restoring" };
    getVideoRating.mockResolvedValue(rating({ like_count: 3, my_rating: null }));
    const { rerender } = render(<RatingControls videoId="v1" />);
    expect(getVideoRating).not.toHaveBeenCalled();

    session = { status: "anon" };
    rerender(<RatingControls videoId="v1" />);

    await screen.findByLabelText("Like");
    expect(getVideoRating).toHaveBeenCalledTimes(1);
  });
});

describe("RatingControls on a federated video", () => {
  const ui = () => <RatingControls videoId="r1" adapter={remoteRatingAdapter} />;

  it("reads the caller's own vote, shows no counts, and toggles it", async () => {
    getRemoteVideoRating.mockResolvedValue({ my_rating: "like" });
    clearRemoteVideoRating.mockResolvedValue({ my_rating: null });
    render(ui());

    const like = await screen.findByLabelText("Like");
    expect(like.getAttribute("aria-pressed")).toBe("true");
    expect(like.textContent).toBe("");
    expect(getVideoRating).not.toHaveBeenCalled();

    fireEvent.click(like);
    await waitFor(() => expect(like.getAttribute("aria-pressed")).toBe("false"));
    expect(clearRemoteVideoRating).toHaveBeenCalledWith("r1");
  });

  it("switches to dislike through the remote endpoint", async () => {
    getRemoteVideoRating.mockResolvedValue({ my_rating: "like" });
    setRemoteVideoRating.mockResolvedValue({ my_rating: "dislike" });
    render(ui());
    fireEvent.click(await screen.findByLabelText("Dislike"));
    await waitFor(() =>
      expect(screen.getByLabelText("Dislike").getAttribute("aria-pressed")).toBe("true"),
    );
    expect(setRemoteVideoRating).toHaveBeenCalledWith("r1", "dislike");
  });

  it("does not read for an anonymous viewer (own-vote read is auth-only) and offers sign-in", async () => {
    session = { status: "anon" };
    render(ui());
    expect(await screen.findByLabelText("Like")).toBeTruthy();
    expect(getRemoteVideoRating).not.toHaveBeenCalled();
    expect(screen.getByText("Sign in to rate")).toBeTruthy();
  });

  it("disables the control with an explanation when federation is off (503)", async () => {
    getRemoteVideoRating.mockResolvedValue({ my_rating: null });
    setRemoteVideoRating.mockRejectedValue({ status: 503 });
    render(ui());
    fireEvent.click(await screen.findByLabelText("Like"));
    expect(await screen.findByText(/Federation is turned off/)).toBeTruthy();
    const like = screen.getByLabelText("Like") as HTMLButtonElement;
    expect(like.disabled).toBe(true);
    expect(like.title).toMatch(/Federation is turned off/);
  });

  it("shows a transient message on a rate limit (429) and keeps the control usable", async () => {
    getRemoteVideoRating.mockResolvedValue({ my_rating: null });
    setRemoteVideoRating.mockRejectedValue({ status: 429 });
    render(ui());
    fireEvent.click(await screen.findByLabelText("Like"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/too quickly/);
    expect((screen.getByLabelText("Like") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText("Like").getAttribute("aria-pressed")).toBe("false");
  });
});
