// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignInGate } from "./SignInGate";

let sessionStatus = "anon";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus }),
}));

beforeEach(() => {
  sessionStatus = "anon";
});
afterEach(cleanup);

describe("SignInGate", () => {
  it("prompts with a title and a /login link that completes the sentence", () => {
    render(<SignInGate title="Sign in to see your playlists">to create playlists.</SignInGate>);
    expect(screen.getByText("Sign in to see your playlists")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/login");
    expect(link.className).toContain("underline");
  });

  it("puts the lead-in before the link", () => {
    const { container } = render(
      <SignInGate title="Gone" lead="Your session has ended.">
        to edit your profile.
      </SignInGate>,
    );
    expect(container.textContent).toContain("Your session has ended. Sign in to edit your profile.");
  });

  it("omits the lead-in when there is none", () => {
    const { container } = render(<SignInGate title="Gone">to do the thing.</SignInGate>);
    expect(container.textContent).toContain("Sign in to do the thing.");
    expect(container.textContent).not.toContain("Your session has ended");
  });

  // "restoring" is the boot-time silent refresh, which the session contract
  // says views should treat as loading rather than as signed-out.
  it("shows the restoring spinner instead of the prompt when asked", () => {
    sessionStatus = "restoring";
    render(
      <SignInGate title="Gone" restoringLabel="Loading your account">
        to edit your profile.
      </SignInGate>,
    );
    expect(screen.getByLabelText("Loading your account")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("still prompts while restoring when the call site never asked for a spinner", () => {
    sessionStatus = "restoring";
    render(<SignInGate title="Gone">to do the thing.</SignInGate>);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("renders the optional icon", () => {
    const { container } = render(
      <SignInGate title="Gone" icon={<svg data-testid="glyph" />}>
        to do the thing.
      </SignInGate>,
    );
    expect(container.querySelector('[data-testid="glyph"]')).toBeTruthy();
  });
});
