// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IpfsPlayerOverlay } from "./IpfsPlayerOverlay";

afterEach(cleanup);

describe("IpfsPlayerOverlay", () => {
  it("shows peer-free fetching copy", () => {
    render(<IpfsPlayerOverlay state="fetching" onRefetch={() => {}} onUseServer={() => {}} />);
    expect(screen.getByText("Fetching from IPFS…")).toBeTruthy();
    expect(screen.queryByText(/peer/i)).toBeNull();
  });

  it("shows the error card with re-fetch + play-from-server, peer-free", () => {
    const onRefetch = vi.fn();
    const onUseServer = vi.fn();
    render(
      <IpfsPlayerOverlay state="error" onRefetch={onRefetch} onUseServer={onUseServer} />,
    );
    expect(screen.getByText("Couldn't retrieve this video from IPFS")).toBeTruthy();
    expect(screen.queryByText(/peer/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Re-fetch from IPFS" }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Play from server" }));
    expect(onUseServer).toHaveBeenCalledTimes(1);
  });
});
