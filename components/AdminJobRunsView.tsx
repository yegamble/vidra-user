"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminControls";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { api, subscribeEventStream } from "@/lib/api";
import type {
  EventStreamState,
  JobEvent,
  JobRun,
  JobRunDetailResponse,
  JobRunsResponse,
  JobRunState,
  ServerSentEvent,
} from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";

const PAGE_SIZE = 25;
const EVENT_PAGE_SIZE = 50;
const POLL_FALLBACK_MS = 10_000;
const LIVE_REFRESH_DEBOUNCE_MS = 500;
const DISPLAY_LIMIT = 20_000;

const JOB_STATES: readonly JobRunState[] = [
  "queued",
  "claimed",
  "running",
  "retry_scheduled",
  "succeeded",
  "failed",
  "dead_lettered",
  "cancel_requested",
  "cancelled",
];

type Status = "loading" | "error" | "ready";

type Filters = {
  state: "" | JobRunState;
  type: string;
  queue: string;
  resourceType: string;
  resourceId: string;
  workerId: string;
  createdAfter: string;
  createdBefore: string;
  failure: "" | "true";
};

const EMPTY_FILTERS: Filters = {
  state: "",
  type: "",
  queue: "",
  resourceType: "",
  resourceId: "",
  workerId: "",
  createdAfter: "",
  createdBefore: "",
  failure: "",
};

function trimmed(value: string): string | undefined {
  const next = value.trim();
  return next || undefined;
}

function isoDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function boundedText(value: string): string {
  return value.length <= DISPLAY_LIMIT
    ? value
    : `${value.slice(0, DISPLAY_LIMIT)}\n… display truncated by the client`;
}

function prettyMetadata(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2) ?? "{}";
    return boundedText(json);
  } catch {
    return "[metadata could not be displayed]";
  }
}

function hasMetadata(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length > 0,
  );
}

function stateLabel(state: JobRunState): string {
  return state.replaceAll("_", " ");
}

function StateBadge({ state }: { state: JobRunState }) {
  const variant =
    state === "succeeded"
      ? "success"
      : state === "failed" || state === "dead_lettered"
        ? "danger"
        : state === "retry_scheduled" || state === "cancel_requested"
          ? "warning"
          : state === "running" || state === "claimed"
            ? "accent"
            : "neutral";
  return (
    <Badge variant={variant} status>
      {stateLabel(state)}
    </Badge>
  );
}

function Progress({ run }: { run: JobRun }) {
  if (typeof run.progress_percent !== "number") {
    return <span className="text-xs text-fg-muted">{run.stage || "—"}</span>;
  }
  const value = Math.max(0, Math.min(100, run.progress_percent));
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
        <span className="max-w-28 truncate" title={run.stage || undefined}>
          {run.stage || "Progress"}
        </span>
        <span className="tabular-nums">{Math.round(value)}%</span>
      </div>
      <ProgressBar value={value} label={`Progress for ${run.type}`} />
    </div>
  );
}

function parseJobEvent(event: ServerSentEvent): JobEvent | null {
  if (event.event !== "job-event") return null;
  try {
    const parsed = JSON.parse(event.data) as Partial<JobEvent>;
    return typeof parsed.job_id === "string" ? (parsed as JobEvent) : null;
  } catch {
    return null;
  }
}

/** Individual unified job execution browser. It must remain inside AdminJobsView's RoleGate. */
export function AdminJobRunsView({ refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<JobRunsResponse | null>(null);
  const dataRef = useRef<JobRunsResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);
  const [listRevision, setListRevision] = useState(0);
  const [streamSeed, setStreamSeed] = useState<string | null>(null);
  const needsStreamSeedRef = useRef(true);
  const [streamState, setStreamState] = useState<EventStreamState>("connecting");
  const pendingJobIdsRef = useRef(new Set<string>());
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getJobRuns(
        {
          state: filters.state || undefined,
          type: trimmed(filters.type),
          queue: trimmed(filters.queue),
          resourceType: trimmed(filters.resourceType),
          resourceId: trimmed(filters.resourceId),
          workerId: trimmed(filters.workerId),
          failure: filters.failure === "true" ? true : undefined,
          createdAfter: isoDate(filters.createdAfter),
          createdBefore: isoDate(filters.createdBefore),
          limit,
          offset,
        },
        controller.signal,
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        dataRef.current = response;
        setData(response);
        setStatus("ready");
        setRefreshing(false);
        setRefreshError(null);
        setListRevision((revision) => revision + 1);
        if (needsStreamSeedRef.current) {
          needsStreamSeedRef.current = false;
          setStreamSeed(response.event_cursor);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRefreshing(false);
        if (dataRef.current) setRefreshError("Could not refresh executions; showing the last result.");
        else setStatus("error");
      });
    return () => controller.abort();
  }, [filters, limit, offset, refreshKey, reloadKey]);

  const onLiveEvent = useCallback((message: ServerSentEvent) => {
    const event = parseJobEvent(message);
    if (!event) return;
    pendingJobIdsRef.current.add(event.job_id);
    if (liveTimerRef.current) return;
    liveTimerRef.current = setTimeout(() => {
      liveTimerRef.current = null;
      pendingJobIdsRef.current.clear();
      setReloadKey((key) => key + 1);
    }, LIVE_REFRESH_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (streamSeed === null) return;
    const subscription = subscribeEventStream("/api/v1/admin/jobs/events", {
      lastEventId: streamSeed,
      onEvent: onLiveEvent,
      onStateChange: setStreamState,
      onCursorInvalid: () => {
        needsStreamSeedRef.current = true;
        setStreamSeed(null);
        setStreamState("reconnecting");
        setReloadKey((key) => key + 1);
      },
    });
    return subscription.close;
  }, [onLiveEvent, streamSeed]);

  // REST polling is the explicit fallback whenever the live connection is not
  // open. Hidden tabs do no work; focus catches up immediately.
  useEffect(() => {
    if (status !== "ready" || streamState === "live") return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") setReloadKey((key) => key + 1);
    };
    const timer = setInterval(refreshIfVisible, POLL_FALLBACK_MS);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [status, streamState]);

  const hasFilters = useMemo(
    () => Object.values(filters).some((value) => value !== ""),
    [filters],
  );

  function applyFilters() {
    setRefreshing(dataRef.current !== null);
    setRefreshError(null);
    setOffset(0);
    setFilters({
      ...draft,
      type: draft.type.trim(),
      queue: draft.queue.trim(),
      resourceType: draft.resourceType.trim(),
      resourceId: draft.resourceId.trim(),
      workerId: draft.workerId.trim(),
    });
  }

  function clearFilters() {
    setRefreshing(dataRef.current !== null);
    setRefreshError(null);
    setDraft(EMPTY_FILTERS);
    setOffset(0);
    setFilters(EMPTY_FILTERS);
  }

  return (
    <section aria-labelledby="job-executions-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="job-executions-heading" className="text-[15px] font-bold tracking-tight text-fg">
            Executions
          </h2>
          <p className="text-xs text-fg-muted">
            Individual unified job runs with correlated progress and failure history.
          </p>
        </div>
        <span aria-live="polite">
          {streamState === "live" ? (
            <Badge variant="success">Live</Badge>
          ) : streamState === "reconnecting" ? (
            <Badge variant="warning">Polling fallback</Badge>
          ) : (
            <Badge variant="neutral">Connecting</Badge>
          )}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(dataRef.current !== null);
            setRefreshError(null);
            setReloadKey((key) => key + 1);
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh executions"}
        </Button>
      </div>

      <form
        role="search"
        aria-label="Filter job executions"
        className="grid grid-cols-1 gap-3 rounded-2xl bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <Select
          label="State"
          value={draft.state}
          onChange={(event) =>
            setDraft((current) => ({ ...current, state: event.target.value as Filters["state"] }))
          }
        >
          <option value="">Any state</option>
          {JOB_STATES.map((state) => (
            <option key={state} value={state}>
              {stateLabel(state)}
            </option>
          ))}
        </Select>
        <Input
          label="Type"
          placeholder="video_transcode"
          value={draft.type}
          onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
        />
        <Input
          label="Queue"
          placeholder="transcode_jobs"
          value={draft.queue}
          onChange={(event) => setDraft((current) => ({ ...current, queue: event.target.value }))}
        />
        <Select
          label="Failure"
          value={draft.failure}
          onChange={(event) =>
            setDraft((current) => ({ ...current, failure: event.target.value as Filters["failure"] }))
          }
        >
          <option value="">Any outcome</option>
          <option value="true">Failures only</option>
        </Select>
        <Input
          label="Resource type"
          placeholder="video"
          value={draft.resourceType}
          onChange={(event) =>
            setDraft((current) => ({ ...current, resourceType: event.target.value }))
          }
        />
        <Input
          label="Resource ID"
          placeholder="UUID or stable ID"
          value={draft.resourceId}
          onChange={(event) =>
            setDraft((current) => ({ ...current, resourceId: event.target.value }))
          }
        />
        <Input
          label="Worker"
          placeholder="worker identity"
          value={draft.workerId}
          onChange={(event) => setDraft((current) => ({ ...current, workerId: event.target.value }))}
        />
        <div className="hidden lg:block" aria-hidden="true" />
        <Input
          label="Created after"
          type="datetime-local"
          value={draft.createdAfter}
          onChange={(event) =>
            setDraft((current) => ({ ...current, createdAfter: event.target.value }))
          }
        />
        <Input
          label="Created before"
          type="datetime-local"
          value={draft.createdBefore}
          onChange={(event) =>
            setDraft((current) => ({ ...current, createdBefore: event.target.value }))
          }
        />
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          {(hasFilters || Object.values(draft).some((value) => value !== "")) ? (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {refreshError ? (
        <p role="alert" className="text-sm text-danger">
          {refreshError}
        </p>
      ) : null}

      {status === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading job executions" />
        </div>
      ) : status === "error" || data === null ? (
        <ErrorState
          message="Could not load job executions."
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : data.runs.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No matching executions" : "No executions yet"}
          message={
            hasFilters
              ? "Try widening the job filters."
              : "Unified job runs will appear here as instrumented workflows execute."
          }
        />
      ) : (
        <>
          {/* Deliberately NOT on `AdminTable`, unlike the other admin tables:
              every execution can expand into a full-width detail row, so one
              logical row emits TWO <tr>s. AdminTable's contract is one row in,
              one <tr> out with declared columns — expressing an expansion row
              would mean adding a second rendering mode for this single caller,
              which costs more than the shared chrome saves. */}
          <div className="overflow-x-auto rounded-2xl border border-border-subtle">
            <table className="w-full min-w-[68rem] text-left text-sm" aria-label="Job executions">
              <thead className="border-b border-border-subtle text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2.5">Execution</th>
                  <th scope="col" className="px-3 py-2.5">State</th>
                  <th scope="col" className="px-3 py-2.5">Stage</th>
                  <th scope="col" className="px-3 py-2.5">Resource</th>
                  <th scope="col" className="px-3 py-2.5">Worker</th>
                  <th scope="col" className="px-3 py-2.5">Attempt</th>
                  <th scope="col" className="px-3 py-2.5">Updated</th>
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.runs.map((run) => (
                  <RunRows key={run.id} run={run} refreshToken={listRevision} />
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            total={data.total}
            limit={data.limit}
            offset={data.offset}
            label="executions"
            onOffset={(nextOffset) => {
              setRefreshing(true);
              setRefreshError(null);
              setOffset(nextOffset);
            }}
            onPageSize={(nextLimit) => {
              setRefreshing(true);
              setRefreshError(null);
              // A resize invalidates the window: row 50 of a 25-per-page list
              // is not row 50 of a 10-per-page one.
              setOffset(0);
              setLimit(nextLimit);
            }}
          />
        </>
      )}
    </section>
  );
}

function RunRows({ run, refreshToken }: { run: JobRun; refreshToken: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Fragment>
      <tr>
        <td className="px-3 py-3 align-top">
          <div className="font-medium text-fg">{run.type}</div>
          <div className="font-mono text-xs text-fg-muted" title={run.id}>
            {run.id.slice(0, 12)} · {run.queue}
          </div>
        </td>
        <td className="px-3 py-3 align-top"><StateBadge state={run.state} /></td>
        <td className="px-3 py-3 align-top"><Progress run={run} /></td>
        <td className="px-3 py-3 align-top text-xs text-fg-muted">
          {run.resource_type || run.resource_id ? (
            <>
              <div>{run.resource_type || "resource"}</div>
              <div className="max-w-40 truncate font-mono" title={run.resource_id || undefined}>
                {run.resource_id || "—"}
              </div>
            </>
          ) : "—"}
        </td>
        <td className="max-w-40 truncate px-3 py-3 align-top font-mono text-xs text-fg-muted" title={run.worker_id || undefined}>
          {run.worker_id || "—"}
        </td>
        <td className="px-3 py-3 align-top text-fg-muted tabular-nums">
          {run.attempt}{run.max_attempts ? ` / ${run.max_attempts}` : ""}
        </td>
        <td className="whitespace-nowrap px-3 py-3 align-top text-fg-muted" title={formatDateTime(run.updated_at)}>
          {relativeTime(run.updated_at)}
        </td>
        <td className="px-3 py-3 align-top text-right">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Hide details" : "View details"}
          </Button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={8} className="bg-surface-muted px-4 py-4">
            <JobRunDetail id={run.id} refreshToken={refreshToken} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function JobRunDetail({ id, refreshToken }: { id: string; refreshToken: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState<JobRunDetailResponse | null>(null);
  const [eventsOffset, setEventsOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getJobRun(id, { eventsLimit: EVENT_PAGE_SIZE, eventsOffset }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setDetail(response);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted && !detail) setStatus("error");
      });
    return () => controller.abort();
    // `detail` is intentionally not a dependency: retain it during live refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsOffset, id, refreshToken, reloadKey]);

  if (status === "loading") {
    return <div className="flex justify-center py-8"><Spinner label="Loading execution details" /></div>;
  }
  if (status === "error" || detail === null) {
    return (
      <ErrorState
        message="Could not load execution details."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  const run = detail.run;
  return (
    <div className="flex flex-col gap-5" aria-label={`Details for ${run.type}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-fg">{run.type}</h3>
        <StateBadge state={run.state} />
        <span className="font-mono text-xs text-fg-muted">{run.id}</span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <DetailValue label="Queue" value={run.queue} />
        <DetailValue label="Priority" value={String(run.priority)} />
        <DetailValue label="Attempt" value={`${run.attempt}${run.max_attempts ? ` / ${run.max_attempts}` : ""}`} />
        <DetailValue label="Pipeline run" value={run.pipeline_run_id} mono />
        <DetailValue label="Parent job" value={run.parent_job_id} mono />
        <DetailValue label="Actor" value={run.actor_id} mono />
        <DetailValue label="Resource type" value={run.resource_type} />
        <DetailValue label="Resource ID" value={run.resource_id} mono />
        <DetailValue label="Worker" value={run.worker_id} mono />
        <DetailValue label="Request ID" value={run.request_id} mono />
        <DetailValue label="Correlation ID" value={run.correlation_id} mono />
        <DetailValue label="Trace ID" value={run.trace_id} mono />
        <DetailValue label="Created" value={run.created_at} date />
        <DetailValue label="Claimed" value={run.claimed_at} date />
        <DetailValue label="Started" value={run.started_at} date />
        <DetailValue label="Updated" value={run.updated_at} date />
        <DetailValue label="Finished" value={run.finished_at} date />
        <DetailValue label="Heartbeat" value={run.heartbeat_at} date />
        <DetailValue label="Lease expires" value={run.lease_expires_at} date />
      </dl>

      {run.error_class || run.error_code || run.error_detail ? <ErrorDetail run={run} /> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {hasMetadata(run.input_metadata) ? (
          <MetadataDetails title="Sanitized input metadata" value={run.input_metadata} />
        ) : null}
        {hasMetadata(run.output_metadata) ? (
          <MetadataDetails title="Sanitized output metadata" value={run.output_metadata} />
        ) : null}
      </div>

      <EventHistory detail={detail} onOffset={setEventsOffset} />
    </div>
  );
}

function DetailValue({
  label,
  value,
  mono,
  date,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  date?: boolean;
}) {
  const shown = value ? (date ? formatDateTime(value) : value) : "—";
  return (
    <div className="min-w-0">
      <dt className="font-medium text-fg-muted">{label}</dt>
      <dd className={`${mono ? "font-mono" : ""} break-all text-fg`} title={value || undefined}>
        {shown}
      </dd>
    </div>
  );
}

function ErrorDetail({ run }: { run: JobRun }) {
  return (
    <details className="rounded-xl border border-danger-border bg-surface p-3" open>
      <summary className="cursor-pointer text-sm font-semibold text-danger">Sanitized failure</summary>
      <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <DetailValue label="Class" value={run.error_class} />
        <DetailValue label="Code" value={run.error_code} mono />
        <DetailValue
          label="Retryable"
          value={typeof run.error_retryable === "boolean" ? String(run.error_retryable) : undefined}
        />
      </dl>
      {run.error_detail ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 font-mono text-xs text-fg">
          {boundedText(run.error_detail)}
        </pre>
      ) : null}
    </details>
  );
}

function MetadataDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-xl border border-border-subtle bg-surface p-3">
      <summary className="cursor-pointer text-sm font-semibold text-fg">{title}</summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 font-mono text-xs text-fg">
        {prettyMetadata(value)}
      </pre>
    </details>
  );
}

function EventHistory({
  detail,
  onOffset,
}: {
  detail: JobRunDetailResponse;
  onOffset: (offset: number) => void;
}) {
  return (
    <section aria-labelledby={`events-${detail.run.id}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={`events-${detail.run.id}`} className="font-semibold text-fg">Execution events</h4>
        <span className="text-xs text-fg-muted tabular-nums">{detail.events_total} total</span>
      </div>
      {detail.events.length === 0 ? (
        <p className="text-sm text-fg-muted">No execution events were retained for this run.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface">
          {detail.events.map((event) => (
            <li key={event.id} className="flex flex-col gap-1.5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs font-semibold text-fg">{event.kind}</code>
                <StateBadge state={event.state} />
                {event.stage ? <Badge variant="neutral">{event.stage}</Badge> : null}
                {typeof event.progress_percent === "number" ? (
                  <span className="text-xs text-fg-muted tabular-nums">{Math.round(event.progress_percent)}%</span>
                ) : null}
                <span className="ml-auto whitespace-nowrap text-xs text-fg-muted" title={formatDateTime(event.occurred_at)}>
                  {relativeTime(event.occurred_at)}
                </span>
              </div>
              {event.message ? <p className="text-sm text-fg">{boundedText(event.message)}</p> : null}
              <div className="flex flex-wrap gap-x-4 text-xs text-fg-muted">
                <span>Attempt {event.attempt}</span>
                {event.worker_id ? <span className="font-mono">Worker {event.worker_id}</span> : null}
                {event.request_id ? <span className="font-mono">Request {event.request_id}</span> : null}
                {event.trace_id ? <span className="font-mono">Trace {event.trace_id}</span> : null}
              </div>
              {hasMetadata(event.metadata) ? (
                <MetadataDetails title="Event metadata" value={event.metadata} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <AdminPagination
        total={detail.events_total}
        limit={detail.events_limit}
        offset={detail.events_offset}
        onOffset={onOffset}
        label="events"
      />
    </section>
  );
}
