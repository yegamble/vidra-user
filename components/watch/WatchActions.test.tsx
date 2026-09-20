// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { RatingControls } from "@/components/RatingControls";
import { CommentsSection } from "@/components/CommentsSection";
import { WatchActions } from "./WatchActions";
import { WatchChannelCard } from "./WatchChannelCard";
import { WatchSignInProvider } from "./WatchSignInPrompt";
import { api, type Video } from "@/lib/api";

let status = "anon";
vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status, user: status === "authed" ? { id: "u1", role: "user" } : null }),
  useOptionalSession: () => ({ status, user: status === "authed" ? { id: "u1", role: "user" } : null }),
}));
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return { ...actual, getInstanceCached: vi.fn().mockResolvedValue({ features: { downloads: true } }),
    api: { ...actual.api, getVideoRating: vi.fn(), getSavedVideos: vi.fn(), getMyChannels: vi.fn(),
      getVideoComments: vi.fn(), getMyPlaylists: vi.fn(), followChannel: vi.fn(), unfollowChannel: vi.fn(),
      setVideoRating: vi.fn(), clearVideoRating: vi.fn(), saveVideo: vi.fn(), unsaveVideo: vi.fn(),
      addToPlaylist: vi.fn(), reportVideo: vi.fn(), postComment: vi.fn() } };
});
const video = { id: "v1", channel_id: "c1", title: "A video", short_code: "clip", privacy: "public" } as Video;
function setup(comments = false) {
  return render(<ToastProvider><WatchSignInProvider>
    <WatchChannelCard handle="films" name="Film House" followerCount={25} />
    <WatchActions video={video} getCurrentTime={() => 17} />
    {comments ? <CommentsSection videoId="v1" /> : null}
  </WatchSignInProvider></ToastProvider>);
}
function noProtectedWrites() {
  for (const call of [api.followChannel, api.unfollowChannel, api.setVideoRating, api.clearVideoRating,
    api.saveVideo, api.unsaveVideo, api.addToPlaylist, api.reportVideo, api.postComment]) expect(call).not.toHaveBeenCalled();
}
beforeEach(() => {
  status = "anon";
  window.history.replaceState({}, "", "/v/clip?t=17&playlist=mix#comments");
  vi.mocked(api.getVideoRating).mockResolvedValue({ like_count: 3, dislike_count: 1, my_rating: null });
  vi.mocked(api.getSavedVideos).mockResolvedValue({ videos: [] } as never);
  vi.mocked(api.getMyChannels).mockResolvedValue({ channels: [] } as never);
  vi.mocked(api.getVideoComments).mockResolvedValue({ comments: [] } as never);
  vi.mocked(api.getMyPlaylists).mockResolvedValue({ playlists: [] } as never);
  vi.mocked(api.saveVideo).mockResolvedValue(undefined);
  vi.mocked(api.followChannel).mockResolvedValue(undefined);
  vi.mocked(api.setVideoRating).mockResolvedValue({ like_count: 4, dislike_count: 1, my_rating: "like" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState({}, "", "/"); });

it("presents compact guest actions without duplicate destinations or upfront sign-in prose", async () => {
  setup();
  const actions = within(screen.getByRole("group", { name: "Video actions" }));
  expect((await actions.findByRole("button", { name: "Like" }) as HTMLButtonElement).disabled).toBe(false);
  expect(actions.getAllByRole("button").map((button) => button.getAttribute("aria-label") || button.textContent))
    .toEqual(["Like", "Dislike", "Share", "Save", "More actions"]);
  expect(screen.queryByText(/Sign in to/)).toBeNull();
  expect(screen.getByRole("button", { name: "Follow" })).toBeTruthy();
});

it.each([["Like", "like this video"], ["Dislike", "dislike this video"], ["Save", "save this video"], ["Follow", "follow this channel"]])(
  "%s opens a contextual prompt without a protected mutation", async (label, action) => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: label }));
    const dialog = screen.getByRole("dialog", { name: `Sign in to ${action}` });
    expect(within(dialog).getByRole("link", { name: "Sign in" }).getAttribute("href"))
      .toBe("/login?return_to=%2Fv%2Fclip%3Ft%3D17%26playlist%3Dmix%23comments");
    noProtectedWrites();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

it.each([["Report", "report this video"], ["Save to playlist", "save to a playlist"]])(
  "keeps %s in More with the same sign-in gate", async (label, action) => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Watch later" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(screen.getByRole("dialog", { name: `Sign in to ${action}` })).toBeTruthy();
    noProtectedWrites();
    expect(api.getMyPlaylists).not.toHaveBeenCalled();
  });

it("lets a guest share the current timestamp without signing in", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  expect(screen.getByRole("dialog", { name: "Share this video" })).toBeTruthy();
  expect(screen.getByText("Start at 0:17")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  noProtectedWrites();
});

it("offers an Add a comment action without a fake editor for guests", async () => {
  setup(true);
  fireEvent.click(await screen.findByRole("button", { name: "Add a comment…" }));
  expect(screen.getByRole("dialog", { name: "Sign in to leave a comment" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Add a comment" })).toBeNull();
  noProtectedWrites();
});

it("keeps authenticated save, rating, follow, and playlist actions usable", async () => {
  status = "authed";
  setup();
  await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.click(await screen.findByRole("button", { name: "Like" }));
  fireEvent.click(screen.getByRole("button", { name: "Follow" }));
  await waitFor(() => expect(api.saveVideo).toHaveBeenCalledWith("v1"));
  expect(api.setVideoRating).toHaveBeenCalledWith("v1", "like");
  expect(api.followChannel).toHaveBeenCalledWith("films");
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Save to playlist" }));
  expect(screen.getByRole("dialog", { name: "Save to playlist" })).toBeTruthy();
  await waitFor(() => expect(api.getMyPlaylists).toHaveBeenCalled());
  expect(screen.queryByText(/Sign in to/)).toBeNull();
});


it("does not prompt for a rating while the existing viewer session is restoring", async () => {
  const tree = <WatchSignInProvider><RatingControls videoId="v1" /></WatchSignInProvider>;
  const { rerender } = render(tree);
  await screen.findByRole("button", { name: "Like" });
  status = "restoring";
  rerender(<WatchSignInProvider><RatingControls videoId="v1" /></WatchSignInProvider>);
  const like = screen.getByRole("button", { name: "Like" }) as HTMLButtonElement;
  expect(like.disabled).toBe(true);
  fireEvent.click(like);
  expect(screen.queryByRole("dialog")).toBeNull();
  noProtectedWrites();
});

it("moves focus from More into the prompt and restores it when dismissed", async () => {
  setup();
  const more = screen.getByRole("button", { name: "More actions" });
  more.focus();
  fireEvent.keyDown(more, { key: "ArrowUp" });
  const report = screen.getByRole("menuitem", { name: "Report" });
  report.focus();
  fireEvent.click(report);
  const dialog = screen.getByRole("dialog", { name: "Sign in to report this video" });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(document.activeElement).toBe(more);
});


it("prompts after a guest clicks Reply while keeping the comment readable", async () => {
  vi.mocked(api.getVideoComments).mockResolvedValue({ comments: [{
    id: "comment1", video_id: "v1", body: "A thoughtful comment", author_id: "author1",
    author_username: "alex", author_display_name: "Alex", created_at: "2026-01-01T00:00:00Z",
  }] } as never);
  setup(true);
  fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
  const prompt = screen.getByRole("dialog", { name: "Sign in to reply" });
  expect(within(prompt).getByRole("link", { name: "Sign in" }).getAttribute("href"))
    .toContain("return_to=%2Fv%2Fclip%3Ft%3D17%26playlist%3Dmix%23comments");
  expect(screen.getByText("A thoughtful comment")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Write a reply" })).toBeNull();
  noProtectedWrites();
});
