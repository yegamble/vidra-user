// @vitest-environment jsdom
//
// White-label (branding.hide_software_name): two sentences on /settings/connections
// name the software as the ACTOR doing the cross-posting ("so Vidra can
// announce…", "Vidra never reads your Bluesky feed"). Both keep every factual
// claim — outbound-only, no inbound reads — and only change their subject.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`http ${status}`);
      this.status = status;
    }
  }
  return { FakeApiError, getATProtoAccount: vi.fn() };
});

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "authed" }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: mocks.FakeApiError,
  api: { getATProtoAccount: mocks.getATProtoAccount },
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

import { SoftwareBrandProvider } from "@/components/SoftwareBrandProvider";

import { ConnectionsView } from "./ConnectionsView";

beforeEach(() => {
  // 404 = not linked: the connect form and its explanatory copy render.
  mocks.getATProtoAccount.mockRejectedValue(new mocks.FakeApiError(404));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function show(hidden: boolean) {
  render(
    <SoftwareBrandProvider hidden={hidden}>
      <ConnectionsView />
    </SoftwareBrandProvider>,
  );
  await waitFor(() => expect(screen.getByRole("heading", { name: "Bluesky" })).toBeTruthy());
}

describe("ConnectionsView cross-posting copy", () => {
  it("names the software as the actor by default", async () => {
    await show(false);
    expect(screen.getByText(/so Vidra can announce your newly published/)).toBeTruthy();
    expect(screen.getByText(/Vidra never reads your Bluesky feed/)).toBeTruthy();
  });

  it("neutralizes the subject when hidden, keeping both claims", async () => {
    await show(true);
    expect(
      screen.getByText(/so This platform can announce your newly published/),
    ).toBeTruthy();
    expect(screen.getByText(/This platform never reads your Bluesky feed/)).toBeTruthy();
    // Bluesky is a NETWORK, not this product — it stays named.
    expect(screen.getByRole("heading", { name: "Bluesky" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });
});
