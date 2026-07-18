// @vitest-environment jsdom
//
// BlueskyLoginButton: the ATProto handle-login affordance. Covers the enabled/
// disabled gate, the collapse→expand interaction, empty-handle validation, the
// happy path (begin call + top-level navigation), and the honest start-error
// copy for 422 / 502 / 503.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { beginATProtoLoginMock } = vi.hoisted(() => ({ beginATProtoLoginMock: vi.fn() }));

// Keep ApiError (and everything else) real so the component's `instanceof
// ApiError` status mapping works; only the begin call is a spy.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, beginATProtoLogin: beginATProtoLoginMock };
});

import { ApiError } from "@/lib/api";

import { BlueskyLoginButton } from "./BlueskyLoginButton";

const assignMock = vi.fn();

beforeEach(() => {
  // The submit hands off with window.location.assign; jsdom's real navigation
  // is unimplemented, so swap in a plain location object we can assert on.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign: assignMock, href: "http://localhost/login" },
  });
});

afterEach(() => {
  cleanup();
  beginATProtoLoginMock.mockReset();
  assignMock.mockReset();
});

/** Expand the collapsed button into the handle form. */
function expand() {
  fireEvent.click(screen.getByRole("button", { name: "Continue with Bluesky" }));
  return screen.getByLabelText("Bluesky or ATProto handle");
}

describe("BlueskyLoginButton", () => {
  it("renders the collapsed button when enabled", () => {
    render(<BlueskyLoginButton enabled returnTo="/login" />);
    expect(screen.getByRole("button", { name: "Continue with Bluesky" })).toBeTruthy();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(<BlueskyLoginButton enabled={false} returnTo="/login" />);
    expect(container.firstChild).toBeNull();
  });

  it("expands to a handle field on click", () => {
    render(<BlueskyLoginButton enabled returnTo="/login" />);
    const input = expand();
    expect(input).toBeTruthy();
    expect(input.getAttribute("placeholder")).toBe("alice.bsky.social");
  });

  it("rejects an empty handle without calling the API", () => {
    render(<BlueskyLoginButton enabled returnTo="/login" />);
    expand();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Enter your Bluesky or ATProto handle/);
    expect(beginATProtoLoginMock).not.toHaveBeenCalled();
  });

  it("begins the login and navigates top-level to the authorization URL", async () => {
    beginATProtoLoginMock.mockResolvedValue({
      authorization_url: "https://pds.example/authorize?x=1",
    });
    render(<BlueskyLoginButton enabled returnTo="/login" />);
    const input = expand();
    fireEvent.change(input, { target: { value: "  alice.bsky.social  " } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(beginATProtoLoginMock).toHaveBeenCalledWith("alice.bsky.social", "/login"),
    );
    expect(assignMock).toHaveBeenCalledWith("https://pds.example/authorize?x=1");
  });

  it.each([
    [422, "That doesn't look like a valid handle."],
    [502, "Could not reach your Bluesky server. Try again shortly."],
    [503, "Bluesky sign-in is not enabled on this instance."],
  ])("surfaces honest copy for a %s start failure", async (status, copy) => {
    beginATProtoLoginMock.mockRejectedValue(
      new ApiError({ status, code: "x", message: "raw" }),
    );
    render(<BlueskyLoginButton enabled returnTo="/signup" />);
    const input = expand();
    fireEvent.change(input, { target: { value: "alice.bsky.social" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText(copy);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
