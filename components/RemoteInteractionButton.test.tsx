// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sessionStatus = "anon";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super("x");
      this.status = status;
    }
  },
  errorMessage: (_e: unknown, fallback: string) => fallback,
  api: { resolveRemoteInteraction: vi.fn() },
}));

const browserSubscribeUrl = vi.fn();
vi.mock("@/lib/remote-interaction", async (orig) => ({
  ...(await orig<typeof import("@/lib/remote-interaction")>()),
  browserSubscribeUrl: (...a: unknown[]) => browserSubscribeUrl(...a),
}));

import { ApiError, api } from "@/lib/api";

import { RemoteInteractionButton } from "./RemoteInteractionButton";

const navigate = vi.fn();
// The mocked ApiError takes just a status; the real one takes an object.
const apiError = (status: number) => new (ApiError as unknown as new (s: number) => Error)(status);

beforeEach(() => {
  sessionStatus = "anon";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Follow from another server" }));
  return screen.getByLabelText("Your fediverse handle");
}

describe("RemoteInteractionButton", () => {
  it("renders nothing for signed-in viewers and while the session restores", () => {
    sessionStatus = "authed";
    const { container, rerender } = render(<RemoteInteractionButton kind="channel" id="films" />);
    expect(container.textContent).toBe("");
    sessionStatus = "restoring";
    rerender(<RemoteInteractionButton kind="channel" id="films" />);
    expect(container.textContent).toBe("");
  });

  it("resolves the handle against this instance's channel id and navigates to the https URL", async () => {
    vi.mocked(api.resolveRemoteInteraction).mockResolvedValue({
      url: "https://home.example/authorize_interaction?uri=x",
    });
    render(<RemoteInteractionButton kind="channel" id="films" navigate={navigate} />);
    fireEvent.change(open(), { target: { value: "@bob@home.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://home.example/authorize_interaction?uri=x"));
    expect(api.resolveRemoteInteraction).toHaveBeenCalledWith(
      "bob@home.example",
      `${window.location.origin}/video-channels/films`,
    );
  });

  it("uses the video id and its own wording for a video", async () => {
    vi.mocked(api.resolveRemoteInteraction).mockResolvedValue({ url: "https://home.example/i" });
    render(<RemoteInteractionButton kind="video" id="v-1" navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Interact from your instance" }));
    fireEvent.change(screen.getByLabelText("Your fediverse handle"), { target: { value: "bob@home.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(api.resolveRemoteInteraction).toHaveBeenCalledWith(
      "bob@home.example",
      `${window.location.origin}/videos/v-1`,
    );
  });

  it("refuses to navigate to a non-https URL", async () => {
    vi.mocked(api.resolveRemoteInteraction).mockResolvedValue({ url: "javascript:alert(1)" });
    render(<RemoteInteractionButton kind="channel" id="films" navigate={navigate} />);
    fireEvent.change(open(), { target: { value: "bob@home.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to the visitor's own server when the instance refuses signed-out lookups (403)", async () => {
    vi.mocked(api.resolveRemoteInteraction).mockRejectedValue(apiError(403));
    browserSubscribeUrl.mockResolvedValue("https://home.example/i?uri=x");
    render(<RemoteInteractionButton kind="channel" id="films" navigate={navigate} />);
    fireEvent.change(open(), { target: { value: "bob@home.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://home.example/i?uri=x"));
    expect(browserSubscribeUrl).toHaveBeenCalledWith("bob@home.example", `${window.location.origin}/video-channels/films`);
  });

  it("shows the address to search for when the browser lookup is blocked too", async () => {
    vi.mocked(api.resolveRemoteInteraction).mockRejectedValue(apiError(403));
    browserSubscribeUrl.mockResolvedValue(null);
    render(<RemoteInteractionButton kind="channel" id="films" navigate={navigate} />);
    fireEvent.change(open(), { target: { value: "bob@home.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const box = (await screen.findByLabelText("Address to search for on your server")) as HTMLInputElement;
    expect(box.value).toBe(`${window.location.origin}/video-channels/films`);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejects a malformed handle without calling the API", () => {
    render(<RemoteInteractionButton kind="channel" id="films" navigate={navigate} />);
    fireEvent.change(open(), { target: { value: "not a handle" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toMatch(/user@server/);
    expect(api.resolveRemoteInteraction).not.toHaveBeenCalled();
  });

  it("explains a server that does not support it (404) and a refused one (422)", async () => {
    vi.mocked(api.resolveRemoteInteraction).mockRejectedValueOnce(apiError(404));
    render(<RemoteInteractionButton kind="channel" id="films" navigate={navigate} />);
    fireEvent.change(open(), { target: { value: "bob@home.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/doesn.t support/);

    vi.mocked(api.resolveRemoteInteraction).mockRejectedValueOnce(apiError(422));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/can.t be used/));
    expect(navigate).not.toHaveBeenCalled();
  });
});
