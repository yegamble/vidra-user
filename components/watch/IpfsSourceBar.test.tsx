// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IpfsSourceBar } from "./IpfsSourceBar";

afterEach(cleanup);

describe("IpfsSourceBar", () => {
  it("shows the server default with a peer-free label and a 'Use IPFS' toggle", () => {
    render(<IpfsSourceBar state="server" onToggle={() => {}} onRefetch={() => {}} />);
    expect(screen.getByText("Playing from server (HLS)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use IPFS" })).toBeTruthy();
    // No re-fetch control while on the server source.
    expect(screen.queryByRole("button", { name: "Re-fetch from IPFS" })).toBeNull();
  });

  it("shows 'IPFS · pinned' + a re-fetch control when playing from IPFS", () => {
    const onRefetch = vi.fn();
    render(<IpfsSourceBar state="ipfs" onToggle={() => {}} onRefetch={onRefetch} />);
    expect(screen.getByText("IPFS · pinned")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use server" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Re-fetch from IPFS" }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it("uses peer-free fetching + error copy (no peer counts anywhere)", () => {
    const { rerender } = render(
      <IpfsSourceBar state="fetching" onToggle={() => {}} onRefetch={() => {}} />,
    );
    expect(screen.getByText("IPFS · fetching…")).toBeTruthy();
    rerender(<IpfsSourceBar state="error" onToggle={() => {}} onRefetch={() => {}} />);
    expect(screen.getByText("IPFS · unavailable — playing from server")).toBeTruthy();
    // The error state offers to try IPFS again.
    expect(screen.getByRole("button", { name: "Use IPFS" })).toBeTruthy();
    // Never surfaces a fabricated peer count.
    expect(screen.queryByText(/peer/i)).toBeNull();
  });

  it("fires onToggle from the source pill", () => {
    const onToggle = vi.fn();
    render(<IpfsSourceBar state="server" onToggle={onToggle} onRefetch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Use IPFS" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
