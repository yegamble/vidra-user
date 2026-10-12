// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

let sessionStatus = "authed";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, user: sessionStatus === "authed" ? { id: "u1" } : null }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  errorMessage: (_e: unknown, fallback: string) => fallback,
  api: { lookupRemoteUri: vi.fn(), createRemoteFollow: vi.fn() },
}));

import { api } from "@/lib/api";

import { RemoteInteractionView } from "./RemoteInteractionView";

const URI = "https://peer.example/video-channels/films";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStatus = "authed";
});

describe("RemoteInteractionView", () => {
  it("explains a link with no usable uri, without calling the API", () => {
    render(<RemoteInteractionView uri={null} />);
    expect(screen.getByText(/missing or invalid/i)).toBeTruthy();
    expect(api.lookupRemoteUri).not.toHaveBeenCalled();
  });

  it("asks anonymous visitors to sign in and returns them here", () => {
    sessionStatus = "anon";
    render(<RemoteInteractionView uri={URI} />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe(
      `/login?return_to=${encodeURIComponent(`/remote-interaction?uri=${encodeURIComponent(URI)}`)}`,
    );
    expect(api.lookupRemoteUri).not.toHaveBeenCalled();
  });

  it("sends a resolved remote video to its watch page", async () => {
    vi.mocked(api.lookupRemoteUri).mockResolvedValue({
      remote: [{ type: "video", video: { id: "rv1", title: "Hi", remote: true } }],
    } as never);
    render(<RemoteInteractionView uri={URI} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/remote/rv1"));
    expect(api.lookupRemoteUri).toHaveBeenCalledWith(URI, expect.anything());
  });

  it("offers a Follow button for a resolved remote channel", async () => {
    vi.mocked(api.lookupRemoteUri).mockResolvedValue({
      remote: [{ type: "channel", actor: { actor_url: URI, handle: "films@peer.example", domain: "peer.example" } }],
    } as never);
    vi.mocked(api.createRemoteFollow).mockResolvedValue({ id: "f1", state: "pending" } as never);
    render(<RemoteInteractionView uri={URI} />);
    expect(await screen.findByText("films@peer.example")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() => expect(api.createRemoteFollow).toHaveBeenCalledWith({ actor_url: URI }));
    expect(await screen.findByText(/follow request sent/i)).toBeTruthy();
  });

  it("says so when nothing resolves", async () => {
    vi.mocked(api.lookupRemoteUri).mockResolvedValue({} as never);
    render(<RemoteInteractionView uri={URI} />);
    expect(await screen.findByText(/couldn.t find/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
