// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BROADCAST_DISMISS_STORAGE_KEY,
  broadcastMessageHash,
} from "@/lib/broadcast";
import type {
  InstanceBroadcastBlock,
  InstanceConfigSnapshot,
} from "@/lib/instance-config.server";

import { InstanceBanner } from "./InstanceBanner";

// Built from the W2 contract block (every field optional — the banner must
// tolerate absence), then cast to the full snapshot the layout passes.
function snapshot(broadcast: InstanceBroadcastBlock) {
  return { broadcast } as InstanceConfigSnapshot;
}

const banner = () => screen.queryByRole("region", { name: "Announcement" });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("InstanceBanner", () => {
  it("renders nothing without a snapshot (backend unreachable / pre-W1)", () => {
    render(<InstanceBanner instance={null} />);
    expect(banner()).toBeNull();
  });

  it("renders nothing when the broadcast block is absent", () => {
    render(<InstanceBanner instance={{} as InstanceConfigSnapshot} />);
    expect(banner()).toBeNull();
  });

  it("renders nothing while disabled, even with a message", () => {
    render(<InstanceBanner instance={snapshot({ enabled: false, message: "Hello" })} />);
    expect(banner()).toBeNull();
  });

  it("renders nothing when enabled with an empty or whitespace message", () => {
    render(<InstanceBanner instance={snapshot({ enabled: true, message: "  \n " })} />);
    expect(banner()).toBeNull();
  });

  it("renders the message as sanitized markdown when enabled", () => {
    render(
      <InstanceBanner
        instance={snapshot({
          enabled: true,
          message: "Maintenance **tonight** <script>window.x=1</script>",
          level: "info",
        })}
      />,
    );
    const region = banner();
    expect(region).toBeTruthy();
    // Markdown renders as elements…
    expect(screen.getByText("tonight").tagName).toBe("STRONG");
    // …but raw HTML never becomes ELEMENTS (components/Markdown.tsx security
    // stance: it stays inert text). Not dismissable, so no inline dismiss
    // script exists to confuse this.
    expect(region!.querySelector("script")).toBeNull();
  });

  it("styles by level via tokens: info is neutral, error uses the danger surface", () => {
    const { unmount } = render(
      <InstanceBanner instance={snapshot({ enabled: true, message: "Hi", level: "info" })} />,
    );
    expect(banner()!.className).toContain("bg-surface-muted");
    expect(banner()!.getAttribute("data-level")).toBe("info");
    unmount();

    render(<InstanceBanner instance={snapshot({ enabled: true, message: "Hi", level: "error" })} />);
    expect(banner()!.className).toContain("bg-danger-surface");
    expect(banner()!.className).toContain("border-danger-border");
    expect(banner()!.getAttribute("data-level")).toBe("error");
  });

  it("treats an unknown level as info", () => {
    render(
      <InstanceBanner
        instance={snapshot({
          enabled: true,
          message: "Hi",
          level: "critical" as unknown as "info",
        })}
      />,
    );
    expect(banner()!.getAttribute("data-level")).toBe("info");
  });

  it("shows no dismiss affordance when not dismissable", () => {
    render(<InstanceBanner instance={snapshot({ enabled: true, message: "Hi" })} />);
    expect(banner()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).toBeNull();
    // No dismissal, no pre-paint script either.
    expect(document.querySelector("#broadcast-banner script")).toBeNull();
  });

  it("dismissing hides the banner and persists the message hash", () => {
    render(
      <InstanceBanner
        instance={snapshot({ enabled: true, message: "Read me", dismissable: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    expect(banner()).toBeNull();
    expect(localStorage.getItem(BROADCAST_DISMISS_STORAGE_KEY)).toBe(
      broadcastMessageHash("Read me"),
    );
  });

  it("stays hidden on the next visit for the same message", async () => {
    localStorage.setItem(BROADCAST_DISMISS_STORAGE_KEY, broadcastMessageHash("Read me"));
    render(
      <InstanceBanner
        instance={snapshot({ enabled: true, message: "Read me", dismissable: true })}
      />,
    );
    await waitFor(() => expect(banner()).toBeNull());
  });

  it("re-shows the banner when the message was edited since dismissal", async () => {
    localStorage.setItem(BROADCAST_DISMISS_STORAGE_KEY, broadcastMessageHash("Old wording"));
    render(
      <InstanceBanner
        instance={snapshot({ enabled: true, message: "New wording", dismissable: true })}
      />,
    );
    // Give the reconciliation effect a tick — the banner must survive it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Dismiss announcement" })).toBeTruthy(),
    );
    expect(banner()).toBeTruthy();
  });

  it("embeds the pre-paint dismiss script keyed to this message's hash", () => {
    render(
      <InstanceBanner
        instance={snapshot({ enabled: true, message: "Read me", dismissable: true })}
      />,
    );
    const script = banner()!.querySelector("script");
    expect(script).toBeTruthy();
    expect(script!.textContent).toContain(JSON.stringify(broadcastMessageHash("Read me")));
    expect(script!.textContent).toContain(JSON.stringify(BROADCAST_DISMISS_STORAGE_KEY));
  });
});
