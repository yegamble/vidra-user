// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StreamKeyReveal } from "./LiveStreamsSection";

afterEach(cleanup);

describe("StreamKeyReveal ingest URLs", () => {
  it("leads with RTMPS and keeps plain RTMP as a labelled fallback", () => {
    render(
      <StreamKeyReveal
        revealed={{
          id: "s1",
          key: "k-secret",
          rtmp: "rtmp://ingest.test/live",
          rtmps: "rtmps://ingest.test:1936/live",
        }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("rtmps://ingest.test:1936/live")).toBeTruthy();
    expect(screen.getByText(/recommended, encrypted/)).toBeTruthy();
    expect(screen.getByText("RTMP server (fallback)")).toBeTruthy();
    expect(screen.getByText("rtmp://ingest.test/live")).toBeTruthy();
    const order = screen.getAllByText(/^rtmps?:\/\//).map((n) => n.textContent);
    expect(order).toEqual(["rtmps://ingest.test:1936/live", "rtmp://ingest.test/live"]);
  });

  it("shows only the plain RTMP row, unlabelled as fallback, when RTMPS is not offered", () => {
    render(
      <StreamKeyReveal
        revealed={{ id: "s1", key: "k-secret", rtmp: "rtmp://ingest.test/live" }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("RTMP server")).toBeTruthy();
    expect(screen.queryByText(/RTMPS server/)).toBeNull();
    expect(screen.queryByText(/fallback/)).toBeNull();
  });
});
