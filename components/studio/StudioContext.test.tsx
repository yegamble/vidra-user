// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// StudioProvider loads the caller's channels once via api.getMyChannels; mock the
// one endpoint it depends on so the persistence/fallback logic is unit-testable.
vi.mock("@/lib/api", () => ({
  api: { getMyChannels: vi.fn() },
}));

import { api } from "@/lib/api";
import type { Channel } from "@/lib/api";

import { StudioProvider, useStudio } from "./StudioContext";

const getMyChannels = vi.mocked(api.getMyChannels);

// Mirrors StudioContext's own STORAGE_KEY.
const STORAGE_KEY = "vidra.studio.channel";

function channel(handle: string, overrides: Partial<Channel> = {}): Channel {
  return {
    id: handle,
    owner_id: "u1",
    handle,
    display_name: handle,
    description: "",
    follower_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    activitypub_enabled: true,
    atproto_enabled: false,
    ...overrides,
  };
}

// A probe that surfaces the context values as text (and a button that switches to
// the "second" channel) for assertions.
function Probe() {
  const { status, channels, currentHandle, currentChannel, setCurrentHandle } = useStudio();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="current">{currentHandle}</span>
      <span data-testid="current-name">{currentChannel?.display_name ?? "none"}</span>
      <span data-testid="count">{channels.length}</span>
      <span data-testid="roles">
        {channels.map((c) => `${c.handle}:${c.role ?? "owner"}`).join(",")}
      </span>
      <button type="button" onClick={() => setCurrentHandle("second")}>
        switch
      </button>
    </div>
  );
}

function renderStudio() {
  return render(
    <StudioProvider>
      <Probe />
    </StudioProvider>,
  );
}

async function ready() {
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
}

beforeEach(() => {
  window.localStorage.clear();
  getMyChannels.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("StudioProvider", () => {
  it("restores the persisted current channel when it still exists", async () => {
    window.localStorage.setItem(STORAGE_KEY, "second");
    getMyChannels.mockResolvedValue({ channels: [channel("first"), channel("second")] });

    renderStudio();

    await ready();
    expect(screen.getByTestId("current").textContent).toBe("second");
    expect(screen.getByTestId("current-name").textContent).toBe("second");
  });

  it("falls back to the first channel when the persisted handle is stale", async () => {
    window.localStorage.setItem(STORAGE_KEY, "ghost");
    getMyChannels.mockResolvedValue({ channels: [channel("first"), channel("second")] });

    renderStudio();

    await ready();
    expect(screen.getByTestId("current").textContent).toBe("first");
  });

  it("falls back to the first channel when no selection is persisted", async () => {
    getMyChannels.mockResolvedValue({ channels: [channel("first"), channel("second")] });

    renderStudio();

    await ready();
    expect(screen.getByTestId("current").textContent).toBe("first");
  });

  it("exposes an empty current handle and channel when the caller has zero channels", async () => {
    getMyChannels.mockResolvedValue({ channels: [] });

    renderStudio();

    await ready();
    expect(screen.getByTestId("current").textContent).toBe("");
    expect(screen.getByTestId("current-name").textContent).toBe("none");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("exposes owned + editor channels with their roles for grouping", async () => {
    getMyChannels.mockResolvedValue({
      channels: [channel("mine", { role: "owner" }), channel("shared", { role: "editor" })],
    });

    renderStudio();

    await ready();
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("roles").textContent).toBe("mine:owner,shared:editor");
    // With no stored selection, the first channel is the default current one.
    expect(screen.getByTestId("current").textContent).toBe("mine");
  });

  it("persists a switched channel to localStorage", async () => {
    getMyChannels.mockResolvedValue({ channels: [channel("first"), channel("second")] });

    renderStudio();

    await waitFor(() => expect(screen.getByTestId("current").textContent).toBe("first"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "switch" }));
    });

    expect(screen.getByTestId("current").textContent).toBe("second");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("second");
  });
});
