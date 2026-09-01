// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/messages" }));
// The rail is the surface that would fire the 403s; stub it so its absence is
// the assertion rather than a network side effect.
vi.mock("./ConversationRail", () => ({
  ConversationRail: () => <div data-testid="rail" />,
}));
vi.mock("@/lib/api", () => ({
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { MessagingShell } from "./MessagingShell";

function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
}

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
});

describe("MessagingShell", () => {
  it("says so, and mounts no rail, when the instance discloses messaging: false", () => {
    setInstanceFeaturesForTests(features({ messaging: false }));
    render(
      <MessagingShell>
        <div data-testid="thread" />
      </MessagingShell>,
    );
    expect(screen.queryByTestId("rail")).toBeNull();
    expect(screen.queryByTestId("thread")).toBeNull();
    expect(screen.getByText("Messaging is turned off")).toBeTruthy();
  });

  // Counter-tests: disclosed on, and not disclosed at all, both behave as today.
  it("renders the rail and the thread pane when messaging is disclosed available", () => {
    setInstanceFeaturesForTests(features({ messaging: true }));
    render(
      <MessagingShell>
        <div data-testid="thread" />
      </MessagingShell>,
    );
    expect(screen.getByTestId("rail")).toBeTruthy();
    expect(screen.getByTestId("thread")).toBeTruthy();
  });

  it("renders the rail when the field is absent (a core that predates it)", () => {
    setInstanceFeaturesForTests(features());
    render(
      <MessagingShell>
        <div data-testid="thread" />
      </MessagingShell>,
    );
    expect(screen.getByTestId("rail")).toBeTruthy();
  });
});
