// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getJobRuns: vi.fn(),
  getJobRun: vi.fn(),
  close: vi.fn(),
  subscribeEventStream: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getJobRuns: mocks.getJobRuns,
    getJobRun: mocks.getJobRun,
  },
  subscribeEventStream: mocks.subscribeEventStream,
}));

import { AdminJobRunsView } from "./AdminJobRunsView";

const run = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  type: "video_import",
  queue: "import_jobs",
  state: "failed" as const,
  stage: "finished",
  progress_percent: 100,
  priority: 0,
  attempt: 3,
  max_attempts: 3,
  resource_type: "video",
  resource_id: "video-bbbb",
  request_id: "req-1",
  correlation_id: "corr-1",
  trace_id: "0af7651916cd43dd8448eb211c80319c",
  worker_id: "worker-a",
  created_at: "2026-07-03T09:55:00Z",
  started_at: "2026-07-03T09:56:00Z",
  updated_at: "2026-07-03T10:00:00Z",
  finished_at: "2026-07-03T10:00:00Z",
  input_metadata: { resolver: "direct_http" },
  output_metadata: {},
  error_class: "transient",
  error_code: "upstream_unavailable",
  error_detail: "Upstream connection refused (credentials redacted).",
  error_retryable: true,
};

const list = {
  runs: [run],
  total: 1,
  limit: 25,
  offset: 0,
  event_cursor: "90071992547409930001",
};

const detail = {
  run,
  events: [
    {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      cursor: "90071992547409930001",
      job_id: run.id,
      kind: "failed",
      state: "failed" as const,
      stage: "finished",
      progress_percent: 100,
      attempt: 3,
      worker_id: "worker-a",
      message: "Import attempt failed safely.",
      metadata: { reason_code: "upstream_unavailable" },
      occurred_at: "2026-07-03T10:00:00Z",
    },
  ],
  events_total: 1,
  events_limit: 50,
  events_offset: 0,
  event_cursor: "90071992547409930001",
};

describe("AdminJobRunsView", () => {
  beforeEach(() => {
    mocks.getJobRuns.mockResolvedValue(list);
    mocks.getJobRun.mockResolvedValue(detail);
    mocks.subscribeEventStream.mockReturnValue({ close: mocks.close });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sends server filters and expands sanitized failure/event detail", async () => {
    render(<AdminJobRunsView refreshKey={0} />);
    expect(await screen.findByText("video_import")).toBeTruthy();
    // The stream subscription is an effect of the SAME state update that paints
    // the rows (the list response seeds `streamSeed`), so it lands in a later
    // passive-effect flush than the DOM mutation `findByText` observes. RTL
    // disables the act environment inside `findBy*`/`waitFor` and only drains a
    // single `setTimeout(…, 0)` afterwards, which is not ordered against React's
    // scheduler task — so a bare assert here loses the race under CPU load.
    await waitFor(() =>
      expect(mocks.subscribeEventStream).toHaveBeenCalledWith(
        "/api/v1/admin/jobs/events",
        expect.objectContaining({ lastEventId: "90071992547409930001" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("State"), { target: { value: "failed" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "video_import" } });
    fireEvent.change(screen.getByLabelText("Resource type"), { target: { value: "video" } });
    fireEvent.change(screen.getByLabelText("Resource ID"), { target: { value: "video-bbbb" } });
    fireEvent.change(screen.getByLabelText("Worker"), { target: { value: "worker-a" } });
    fireEvent.change(screen.getByLabelText("Failure"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => expect(mocks.getJobRuns).toHaveBeenCalledTimes(2));
    expect(mocks.getJobRuns.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        state: "failed",
        type: "video_import",
        resourceType: "video",
        resourceId: "video-bbbb",
        workerId: "worker-a",
        failure: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(await screen.findByText("Sanitized failure")).toBeTruthy();
    expect(screen.getByText("Upstream connection refused (credentials redacted).")).toBeTruthy();
    expect(screen.getByText("Sanitized input metadata")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Execution events" })).toBeTruthy();
    expect(screen.getByText("Import attempt failed safely.")).toBeTruthy();
  });

  it("requests the next offset page", async () => {
    mocks.getJobRuns
      .mockResolvedValueOnce({ ...list, total: 30 })
      .mockResolvedValueOnce({ ...list, total: 30, offset: 25 });
    render(<AdminJobRunsView refreshKey={0} />);
    await screen.findByText("1–25 of 30");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.getJobRuns).toHaveBeenCalledTimes(2));
    expect(mocks.getJobRuns.mock.calls[1][0]).toEqual(expect.objectContaining({ offset: 25 }));
  });
});
