// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({
  getATProtoAccount: vi.fn(),
  updateChannel: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getATProtoAccount: mocks.getATProtoAccount,
      updateChannel: mocks.updateChannel,
    },
  };
});

import { ApiError } from "@/lib/api";
import type { Channel } from "@/lib/api";

import { DistributionCard } from "./DistributionCard";

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "c1",
    owner_id: "u1",
    handle: "ada_makes",
    display_name: "Ada Makes",
    description: "",
    follower_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    activitypub_enabled: true,
    atproto_enabled: true,
    atproto_active: true,
    ...overrides,
  } as Channel;
}

afterEach(cleanup);
beforeEach(() => {
  mocks.getATProtoAccount.mockReset();
  mocks.updateChannel.mockReset();
});

describe("DistributionCard", () => {
  it("owner with a linked account gets both protocol toggles and PATCHes on change", async () => {
    mocks.getATProtoAccount.mockResolvedValue({ handle: "ada.bsky.social" });
    mocks.updateChannel.mockResolvedValue(channel({ activitypub_enabled: false }));
    const onChange = vi.fn();

    render(<DistributionCard channel={channel()} canManage onChange={onChange} />);

    const apToggle = await screen.findByRole("switch", { name: /ActivityPub/ });
    expect(await screen.findByRole("switch", { name: /Bluesky/ })).toBeTruthy();
    expect(apToggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(apToggle);
    await waitFor(() =>
      expect(mocks.updateChannel).toHaveBeenCalledWith("ada_makes", { activitypub_enabled: false }),
    );
    expect(onChange).toHaveBeenCalledWith(channel({ activitypub_enabled: false }));
  });

  it("owner without a linked Bluesky account sees a connect CTA instead of the ATProto toggle", async () => {
    mocks.getATProtoAccount.mockRejectedValue(
      new ApiError({ status: 404, code: "not_found", message: "no atproto account" }),
    );

    render(<DistributionCard channel={channel({ atproto_active: false })} canManage />);

    const cta = await screen.findByRole("link", { name: /Link your Bluesky account/ });
    expect(cta.getAttribute("href")).toBe("/settings/connections");
    expect(screen.queryByRole("switch", { name: /Bluesky/ })).toBeNull();
    // ActivityPub still toggleable.
    expect(screen.getByRole("switch", { name: /ActivityPub/ })).toBeTruthy();
  });

  it("hides the ATProto row entirely when the instance has the extension disabled", async () => {
    mocks.getATProtoAccount.mockRejectedValue(
      new ApiError({ status: 503, code: "disabled", message: "atproto off" }),
    );

    render(<DistributionCard channel={channel()} canManage />);

    // The ActivityPub toggle appears; the ATProto row never does.
    expect(await screen.findByRole("switch", { name: /ActivityPub/ })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("ATProto")).toBeNull());
  });

  it("editor / read-only view shows status badges, not toggles", async () => {
    mocks.getATProtoAccount.mockResolvedValue({ handle: "ada.bsky.social" });

    render(<DistributionCard channel={channel({ atproto_active: false })} />);

    await waitFor(() => expect(screen.queryByText("ATProto")).toBeTruthy());
    expect(screen.queryByRole("switch")).toBeNull();
    // ActivityPub enabled → "Active"; ATProto inactive → "Off".
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
  });
});
