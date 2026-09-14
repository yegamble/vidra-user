// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    listChannelDonationAddresses: vi.fn(),
    listUserDonationAddresses: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import type { DonationAddress } from "@/lib/api";

import { SoftwareBrandProvider } from "@/components/SoftwareBrandProvider";

import { SupportButton } from "./SupportButton";

const mockChannel = vi.mocked(api.listChannelDonationAddresses);

function addr(over: Partial<DonationAddress> = {}): DonationAddress {
  return {
    id: "d1",
    owner_id: "u1",
    network: "ethereum",
    address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    label: "Main",
    verified: true,
    created_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SupportButton", () => {
  it("renders nothing when the entity exposes no public address", async () => {
    mockChannel.mockResolvedValue({ addresses: [] });
    const { container } = render(
      <SupportButton sources={[{ kind: "channel", handle: "grade-house" }]} name="Grade House" />,
    );
    await waitFor(() => expect(mockChannel).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("shows an accent Support pill and opens a dialog with QR, address, and a verified pill", async () => {
    mockChannel.mockResolvedValue({ addresses: [addr()] });
    render(
      <SupportButton sources={[{ kind: "channel", handle: "grade-house" }]} name="Grade House" />,
    );

    const trigger = await screen.findByRole("button", { name: "Support" });
    fireEvent.click(trigger);

    // The dialog names the entity and shows the mono address + a scannable QR.
    expect(screen.getByRole("dialog", { name: "Support Grade House" })).toBeTruthy();
    expect(
      screen.getByText("0x71C7656EC7ab88b098defB751B7401B5f6d8976F"),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: /donation address QR/i })).toBeTruthy();
    // Verified addresses land as the AA-safe success tint pill (never the failing
    // white-on-green solid).
    expect(screen.getByText("Verified")).toBeTruthy();
    // Non-custodial disclaimer.
    expect(screen.getByText(/peer-to-peer and irreversible/i)).toBeTruthy();
  });

  it("copies the address and confirms with 'Copied'", async () => {
    mockChannel.mockResolvedValue({ addresses: [addr()] });
    render(
      <SupportButton sources={[{ kind: "channel", handle: "grade-house" }]} name="Grade House" />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Support" }));

    const copy = screen.getByRole("button", { name: /Copy Ethereum/i });
    fireEvent.click(copy);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      ),
    );
    await screen.findByText("Copied");
  });

  it("marks an unverified address as Unverified", async () => {
    mockChannel.mockResolvedValue({
      addresses: [addr({ network: "bitcoin", address: "bc1qxyz", verified: false })],
    });
    render(
      <SupportButton sources={[{ kind: "channel", handle: "grade-house" }]} name="Grade House" />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Support" }));
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.queryByText("Verified")).toBeNull();
  });
});

// White-label (branding.hide_software_name): the non-custodial disclaimer names
// the platform in prose, so the sentence's subject comes from the seam. The
// claim itself must survive — it is a legal statement, not branding.
describe("SupportButton non-custodial disclaimer", () => {
  async function openDialog(hidden: boolean) {
    mockChannel.mockResolvedValue({ addresses: [addr()] });
    render(
      <SoftwareBrandProvider hidden={hidden}>
        <SupportButton sources={[{ kind: "channel", handle: "grade-house" }]} name="Grade House" />
      </SoftwareBrandProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /support/i }));
    return screen.findByRole("dialog");
  }

  it("names the software while it is not hidden", async () => {
    const dialog = await openDialog(false);
    expect(dialog.textContent).toContain("Vidra never holds or processes funds.");
  });

  it("keeps the disclaimer but not the software name when hidden", async () => {
    const dialog = await openDialog(true);
    expect(dialog.textContent).toContain("This platform never holds or processes funds.");
    expect(dialog.textContent).not.toMatch(/vidra/i);
  });
});
