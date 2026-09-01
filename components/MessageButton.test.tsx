// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status = 0;
  },
  api: { startConversation: vi.fn() },
  errorMessage: (_err: unknown, fallback: string) => fallback,
  // Pulled in by the shared instance-features store; every case here injects a
  // snapshot instead of letting it fetch.
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { MessageButton } from "./MessageButton";

function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
}

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
});

describe("MessageButton", () => {
  it("is absent when the instance discloses messaging: false", () => {
    setInstanceFeaturesForTests(features({ messaging: false }));
    const { container } = render(<MessageButton recipientId="u2" variant="pill" />);
    expect(screen.queryByRole("button", { name: /message/i })).toBeNull();
    expect(container.textContent).toBe("");
  });

  // Counter-tests: the two shapes of "the operator never turned this off".
  it("renders when the instance discloses messaging: true", () => {
    setInstanceFeaturesForTests(features({ messaging: true }));
    render(<MessageButton recipientId="u2" />);
    expect(screen.getByRole("button", { name: "Message" })).toBeTruthy();
  });

  it("renders when the field is absent (a core that predates the disclosure)", () => {
    setInstanceFeaturesForTests(features());
    render(<MessageButton recipientId="u2" />);
    expect(screen.getByRole("button", { name: "Message" })).toBeTruthy();
  });

  it("renders while the instance document is still unknown", () => {
    setInstanceFeaturesForTests(null);
    render(<MessageButton recipientId="u2" />);
    expect(screen.getByRole("button", { name: "Message" })).toBeTruthy();
  });
});
