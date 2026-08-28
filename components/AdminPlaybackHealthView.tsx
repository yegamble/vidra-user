"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminControls";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type {
  QoEBucket,
  QoEEngine,
  QoEPercentiles,
  QoEPlaybackHealth,
  QoESourceSummary,
} from "@/lib/api";
import { formatCount, formatDateTime, relativeTime } from "@/lib/format";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import {
  bucketReportsRenditions,
  DEFAULT_WINDOW_HOURS,
  DELIVERY_SOURCE_LABEL,
  DELIVERY_SOURCE_NOTE,
  ENGINE_LABEL,
  formatApproxMs,
  formatRebufferRate,
  formatShare,
  hasUnreportableEngine,
  PACKAGING_FORMAT_LABEL,
  summarizeErrorCounts,
  WINDOW_OPTIONS,
  windowSince,
  type WindowHours,
} from "@/lib/playback-health";

type Status = "loading" | "error" | "ready";

/**
 * Hourly rows per page of the detail table. A day's worth, which is the unit an
 * operator reads this in — and deliberately not one of `PAGE_SIZE_OPTIONS`, so
 * the pager offers it as an extra choice rather than misreporting the size.
 */
const HOURS_PAGE_SIZE = 24;

/**
 * The rollup worker recomputes every 10 minutes, so nothing this page reads can
 * change faster than that and a tight poll would re-read identical rows. A
 * minute is the compromise: an operator watching an incident sees the newest
 * hour within a minute of it being rolled up, at a twentieth of the request
 * volume the jobs page's 10s fallback carries. There is no SSE stream behind
 * this endpoint, so polling IS the transport here rather than a fallback —
 * hence the same visible-tab + focus discipline the jobs view uses, and no
 * "Live" badge that would promise a stream that does not exist.
 */
const POLL_MS = 60_000;

/**
 * Where the collection switch lives (server placement: page=advanced,
 * section=delivery). The fragment is the Delivery section's stable anchor
 * (sectionAnchorId in AdminInstanceConfigView), so "under Delivery" lands on
 * the promised control instead of the top of the longest config page.
 */
const COLLECTION_SETTING_PAGE = "/admin/config/advanced#config-section-delivery";
const COLLECTION_SETTING_KEY = "qoe_collection_enabled";

// AdminPlaybackHealthView is the admin-only playback-quality page: how long
// viewers waited for the first frame and how much they rebuffered, grouped by
// the delivery source that actually served the bytes (phase-4 delivery item 4).
// The default view is the phase-4 exit criterion itself — "TTFF/rebuffer
// percentiles per source for the last 24h" — which the endpoint answers with no
// parameters at all.
//
// Three things this data does that a naive page would render as a bug, and how
// each is handled here instead:
//
//   1. Native HLS can NEVER name the variant it is playing (the browser owns
//      variant selection through the manifest's SCORE attribute). Its rows
//      render "Not reportable", never a 0 that reads as flawless ABR.
//   2. The attested share is usually 0% and that is CORRECT — there is no
//      session table, so a public video's session id is client-asserted. It is
//      shown plainly rather than hidden, and never dressed up as a warning.
//   3. Empty is the normal initial state. The empty copy says WHY (collection
//      off vs. on-but-nothing-rolled-up-yet) instead of looking broken.
//
// Read-only. Role-gated by RoleGate — an under-privileged/anonymous viewer sees
// the shared permission prompt and nothing fetches.
export function AdminPlaybackHealthView() {
  return (
    <RoleGate minRole="admin" action="view playback health">
      <PlaybackHealthPanel />
    </RoleGate>
  );
}

/**
 * Exported for unit tests (rendered directly, bypassing the RoleGate wrapper —
 * the same pattern InfrastructurePanel uses). Production always enters via
 * AdminPlaybackHealthView so the admin gate applies.
 */
export function PlaybackHealthPanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<QoEPlaybackHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<WindowHours>(DEFAULT_WINDOW_HOURS);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(HOURS_PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const collection = useCollectionSwitch();

  useEffect(() => {
    const controller = new AbortController();
    api
      .getPlaybackHealth(
        { since: windowSince(windowHours), limit, offset },
        controller.signal,
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setError(null);
        setStatus("ready");
        setFetchedAt(new Date().toISOString());
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = errorMessage(err, "Could not load playback health.", {
          "503": "Playback telemetry is not wired on this server.",
        });
        setError(message);
        // A poll that fails must not throw away a snapshot the operator is
        // reading: the last good window stays on screen under an alert, and
        // only a failure with nothing to show falls back to the error state.
        if (data === null) setStatus("error");
      });
    return () => controller.abort();
    // `data` is read to decide refresh-vs-replace and is deliberately not a
    // dependency; adding it would re-fetch on every successful fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, reloadKey, windowHours]);

  useVisiblePoll({
    enabled: status === "ready",
    intervalMs: POLL_MS,
    onPoll: () => setReloadKey((key) => key + 1),
  });

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading playback health" />
      </div>
    );
  }
  if (status === "error" || data === null) {
    return (
      <ErrorState
        message={error ?? "Could not load playback health."}
        onRetry={refresh}
      />
    );
  }

  const sources = data.sources ?? [];
  const buckets = data.buckets ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-56">
          <Select
            label="Window"
            value={String(windowHours)}
            onChange={(event) => {
              // Drop the current snapshot rather than leaving another window's
              // numbers under the new window's label if the fetch then fails.
              // Paging deliberately does NOT do this — a page of the same
              // window is still the same window.
              setStatus("loading");
              setData(null);
              setError(null);
              setOffset(0);
              setWindowHours(Number(event.target.value) as WindowHours);
            }}
          >
            {WINDOW_OPTIONS.map((option) => (
              <option key={option.hours} value={option.hours}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-3">
          {fetchedAt ? (
            <span className="text-xs text-fg-muted" title={formatDateTime(fetchedAt)}>
              Read {relativeTime(fetchedAt)}
            </span>
          ) : null}
          <Button variant="secondary" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error} Showing the last result that loaded.
        </p>
      ) : null}

      <CollectionSwitchPanel state={collection} />

      <p className="text-[13px] text-fg-muted">
        Percentiles are computed from fixed-boundary histograms — the only shape
        that merges exactly across a window&rsquo;s hourly rows — so they carry
        roughly 15% bucket resolution. Read them as bands, not stopwatch
        readings.
      </p>

      <section aria-label="Delivery sources" className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">By delivery source</h2>
          <p className="text-[13px] text-fg-muted">
            {data.window_start && data.window_end
              ? `${formatDateTime(data.window_start)} — ${formatDateTime(data.window_end)}, merged over the whole window.`
              : "Merged over the whole window."}
          </p>
        </div>
        {sources.length === 0 ? (
          <NothingMeasured collection={collection} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2" aria-label="Delivery source summaries">
            {sources.map((source) => (
              <li key={source.delivery_source ?? "unknown"}>
                <SourceCard source={source} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {sources.length > 0 ? <AttestationNote sources={sources} /> : null}

      {buckets.length > 0 || (data.buckets_total ?? 0) > 0 ? (
        <HourlyDetail
          buckets={buckets}
          total={data.buckets_total ?? 0}
          limit={data.limit ?? limit}
          offset={data.offset ?? 0}
          onOffset={setOffset}
          onPageSize={(next) => {
            // A new page size invalidates the window: row 48 of a 24-per-page
            // list is not row 48 of a 10-per-page one.
            setOffset(0);
            setLimit(next);
          }}
        />
      ) : null}
    </div>
  );
}

// --- The collection switch --------------------------------------------------

type CollectionSwitch = {
  status: Status;
  /** true/false when read; null when it could not be read (never assumed). */
  enabled: boolean | null;
  recheck: () => void;
};

/**
 * The `qoe_collection_enabled` runtime switch, read on its own.
 *
 * It is a SEPARATE endpoint from the rollups and it fails separately: a
 * settings read that 500s must not blank a window of measurements the operator
 * is in the middle of reading, and equally an unreadable switch must never be
 * rendered as "off" — off is a claim, and this hook only makes it when the
 * server actually said so.
 */
function useCollectionSwitch(): CollectionSwitch {
  const [status, setStatus] = useState<Status>("loading");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstanceSettings(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const row = response.settings.find((s) => s.key === COLLECTION_SETTING_KEY);
        setEnabled(typeof row?.value === "boolean" ? row.value : null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setEnabled(null);
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const recheck = useCallback(() => {
    setStatus("loading");
    setEnabled(null);
    setReloadKey((key) => key + 1);
  }, []);

  return { status, enabled, recheck };
}

function CollectionSwitchPanel({ state }: { state: CollectionSwitch }) {
  const pill = collectionBadge(state);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Measurement</p>
        <p className="mt-0.5 text-[13px] text-fg-muted">
          {state.status === "loading" ? (
            "Reading the collection switch…"
          ) : state.enabled === true ? (
            "Players are reporting playback quality. Rollups recompute every 10 minutes, so a playback appears here within about ten minutes of happening."
          ) : state.enabled === false ? (
            <>
              Collection is switched off, so nothing playing right now is being
              measured. Existing rollups are kept and age out on their own
              schedule.{" "}
              <Link
                href={COLLECTION_SETTING_PAGE}
                className="font-medium text-accent hover:underline"
              >
                Turn it back on under Delivery
              </Link>
            </>
          ) : (
            "The collection switch could not be read, so whether measurement is running is unknown rather than off."
          )}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <Badge variant={pill.variant} status>
          {pill.label}
        </Badge>
        <Button variant="secondary" size="sm" onClick={state.recheck}>
          Re-check
        </Button>
      </span>
    </div>
  );
}

function collectionBadge(state: CollectionSwitch): { variant: BadgeVariant; label: string } {
  if (state.status === "loading") return { variant: "neutral", label: "Checking" };
  if (state.enabled === true) return { variant: "success", label: "On" };
  if (state.enabled === false) return { variant: "warning", label: "Off" };
  return { variant: "neutral", label: "Not reported" };
}

// --- Empty --------------------------------------------------------------

/**
 * Empty is the NORMAL initial state here — a fresh instance has no rollups, the
 * worker only runs every ten minutes, and a player that never reports produces
 * nothing at all. So this says which of those it is rather than showing a blank
 * page that reads as a broken pipeline and generates a support ticket.
 */
function NothingMeasured({ collection }: { collection: CollectionSwitch }) {
  if (collection.enabled === false) {
    return (
      <EmptyState
        title="Collection is switched off"
        message={
          <>
            Playback quality is not being recorded, so there is nothing to
            summarise. Turn <code className="font-mono">qoe_collection_enabled</code>{" "}
            back on under Delivery on the{" "}
            <Link
              href={COLLECTION_SETTING_PAGE}
              className="font-medium text-accent hover:underline"
            >
              Advanced config page
            </Link>
            , then give it a viewer and ten minutes.
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      title="Nothing measured in this window"
      message={
        <>
          This is what a quiet instance looks like, not a failure. Measurements
          arrive from viewers&rsquo; players and are rolled up every ten minutes,
          so a fresh install stays empty until somebody watches something — and
          then for up to ten minutes more.
          {collection.status === "error"
            ? " This page could not read the collection switch, so it cannot rule out that measurement is simply off."
            : ""}
        </>
      }
    />
  );
}

// --- Per-source summary -----------------------------------------------------

function SourceCard({ source }: { source: QoESourceSummary }) {
  const key = source.delivery_source;
  const label = key ? DELIVERY_SOURCE_LABEL[key] : "Unknown source";
  const note = key ? DELIVERY_SOURCE_NOTE[key] : "";
  const errors = source.error_count ?? 0;
  const starts = source.start_count ?? 0;
  const engines = (source.engines ?? []) as QoEEngine[];
  const errorBreakdown = summarizeErrorCounts(source.error_counts);

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-fg">{label}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">{note}</p>
        </div>
        {errors > 0 ? (
          <Badge variant="danger">
            {formatCount(errors)} {errors === 1 ? "error" : "errors"}
          </Badge>
        ) : (
          <Badge variant="neutral">
            {formatCount(starts)} {starts === 1 ? "playback" : "playbacks"}
          </Badge>
        )}
      </div>

      <dl className="flex flex-col gap-1.5">
        <PercentileRow
          label="Time to first frame"
          percentiles={source.ttff}
          emptyNote="No playback start was measured."
        />
        <PercentileRow
          label="Rebuffer, per stall"
          percentiles={source.rebuffer}
          emptyNote="No stall was recorded — which is not the same as 0 ms of stalling."
        />
      </dl>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Stat label="Playbacks" value={formatCount(starts)} />
        <Stat
          label="Rebuffers / playback"
          value={formatRebufferRate(source.rebuffer_count, starts)}
        />
        <Stat
          label="Bitrate switches"
          value={formatCount(source.bitrate_switch_count ?? 0)}
        />
        <Stat
          label="Attested"
          value={formatShare(source.verified_session_count, source.event_count)}
        />
      </dl>

      {errorBreakdown ? (
        <p className="text-[13px] text-danger">{errorBreakdown}</p>
      ) : null}

      <p className="mt-auto text-xs text-fg-muted">
        {engines.length > 0
          ? `Engines: ${engines.map((engine) => ENGINE_LABEL[engine]).join(", ")}`
          : "No engine reported."}
      </p>

      {hasUnreportableEngine(engines) ? (
        <p className="text-xs text-fg-muted">
          Native HLS sessions contributed here and structurally cannot report
          which variant they are playing — the browser owns that choice through
          the manifest. The switch count above therefore covers only the engines
          that can report one.
        </p>
      ) : null}

      {source.partial_percentiles ? (
        <p className="text-xs text-warning">
          Some hours in this window were recorded against a different histogram
          and were left out of the percentiles. The counts still include them.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * One measurement's p50/p95/p99.
 *
 * A null percentile means "nothing of this kind was measured", which must not
 * render as 0 — 0 ms of rebuffering is exactly the number an operator reads as
 * perfect delivery. When nothing at all was measured the row says so in words
 * instead of printing three dashes an operator has to interpret.
 */
function PercentileRow({
  label,
  percentiles,
  emptyNote,
}: {
  label: string;
  percentiles: QoEPercentiles | undefined;
  emptyNote: string;
}) {
  const measured =
    percentiles?.p50_ms != null ||
    percentiles?.p95_ms != null ||
    percentiles?.p99_ms != null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border-subtle pb-1.5">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">
        {measured ? (
          <span className="tabular-nums">
            p50 {formatApproxMs(percentiles?.p50_ms)} · p95{" "}
            {formatApproxMs(percentiles?.p95_ms)} · p99{" "}
            {formatApproxMs(percentiles?.p99_ms)}
          </span>
        ) : (
          <span className="text-fg-muted">{emptyNote}</span>
        )}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular-nums text-fg">{value}</dd>
    </div>
  );
}

/**
 * The attested share needs a sentence, not a tooltip: 0% is both the usual
 * reading and a number that looks alarming without one. It is not a warning
 * (nothing is wrong) and it is not hidden (these are client-reported numbers
 * and an operator is entitled to know that before acting on them).
 */
function AttestationNote({ sources }: { sources: QoESourceSummary[] }) {
  const events = sources.reduce((sum, s) => sum + (s.event_count ?? 0), 0);
  const verified = sources.reduce((sum, s) => sum + (s.verified_session_count ?? 0), 0);
  return (
    <p className="text-[13px] text-fg-muted">
      <span className="font-medium text-fg">
        {formatShare(verified, events)} attested
      </span>{" "}
      across {formatCount(events)} {events === 1 ? "event" : "events"}. A
      measurement is attested when the server could check its session id against
      a signed playback token, which only password-protected videos and private
      live streams carry. On an ordinary public video there is no token to check,
      so 0% is the expected reading — it means these figures are reported by
      viewers&rsquo; players rather than proven by this server, not that they are
      wrong.
    </p>
  );
}

// --- Hourly detail ----------------------------------------------------------

/**
 * The hourly rollup columns, declared as data for `AdminTable`. Every cell is
 * `align: "top"` in the original; the shell's padding covers the rest, and the
 * three "cannot be reported" cases stay explicit rather than printing a zero.
 */
const HOURLY_COLUMNS: readonly AdminTableColumn<QoEBucket>[] = [
  {
    key: "hour",
    header: "Hour",
    cellClassName: "whitespace-nowrap align-top",
    // The absolute hour leads, not "3h ago": this table exists to answer "when
    // did it change", and the rollup key IS the hour. The relative reading
    // rides underneath for orientation.
    cell: (bucket) =>
      bucket.hour_bucket ? (
        <>
          <div className="text-fg">{formatDateTime(bucket.hour_bucket)}</div>
          <div className="text-xs text-fg-muted">{relativeTime(bucket.hour_bucket)}</div>
        </>
      ) : (
        <span className="text-fg-muted">—</span>
      ),
  },
  {
    key: "source",
    header: "Source",
    cellClassName: "align-top text-fg",
    cell: (bucket) =>
      bucket.delivery_source ? DELIVERY_SOURCE_LABEL[bucket.delivery_source] : "—",
  },
  {
    key: "engine",
    header: "Engine",
    cellClassName: "align-top text-fg-muted",
    cell: (bucket) => (bucket.engine ? ENGINE_LABEL[bucket.engine] : "—"),
  },
  {
    key: "format",
    header: "Format",
    cellClassName: "align-top text-fg-muted",
    cell: (bucket) =>
      bucket.packaging_format ? PACKAGING_FORMAT_LABEL[bucket.packaging_format] : "—",
  },
  {
    key: "playbacks",
    header: "Playbacks",
    cellClassName: "align-top tabular-nums text-fg",
    cell: (bucket) => formatCount(bucket.start_count ?? 0),
  },
  {
    key: "ttff-p50",
    header: "TTFF p50",
    cellClassName: "align-top tabular-nums text-fg",
    cell: (bucket) => formatApproxMs(bucket.ttff?.p50_ms),
  },
  {
    key: "ttff-p95",
    header: "TTFF p95",
    cellClassName: "align-top tabular-nums text-fg",
    cell: (bucket) => formatApproxMs(bucket.ttff?.p95_ms),
  },
  {
    key: "rebuffers",
    header: "Rebuffers",
    cellClassName: "align-top tabular-nums text-fg-muted",
    cell: (bucket) => formatCount(bucket.rebuffer_count ?? 0),
  },
  {
    key: "rebuffer-p95",
    header: "Rebuffer p95",
    cellClassName: "align-top tabular-nums text-fg",
    cell: (bucket) => formatApproxMs(bucket.rebuffer?.p95_ms),
  },
  {
    key: "switches",
    header: "Switches",
    cellClassName: "align-top",
    // The one cell that must never print a number it does not have. Native HLS
    // cannot name the variant it is playing, so a 0 here would read as "this
    // source needed no ABR" when it means "this engine has no hook to tell us".
    // Saying so is the whole reason engine is part of the rollup key.
    cell: (bucket) =>
      bucketReportsRenditions(bucket) ? (
        <span className="tabular-nums text-fg">
          {formatCount(bucket.bitrate_switch_count ?? 0)}
        </span>
      ) : (
        <span
          className="text-fg-muted"
          title="The browser owns variant selection on native HLS through the manifest's SCORE attribute, so this engine cannot report switches at all."
        >
          Not reportable
        </span>
      ),
  },
  {
    key: "errors",
    header: "Errors",
    cellClassName: "align-top",
    cell: (bucket) => {
      const errors = bucket.error_count ?? 0;
      const breakdown = summarizeErrorCounts(bucket.error_counts);
      return (
        <>
          <span
            className={
              errors > 0
                ? "font-semibold tabular-nums text-danger"
                : "tabular-nums text-fg-muted"
            }
          >
            {formatCount(errors)}
          </span>
          {breakdown ? <div className="text-xs text-fg-muted">{breakdown}</div> : null}
        </>
      );
    },
  },
];

function HourlyDetail({
  buckets,
  total,
  limit,
  offset,
  onOffset,
  onPageSize,
}: {
  buckets: QoEBucket[];
  total: number;
  limit: number;
  offset: number;
  onOffset: (offset: number) => void;
  onPageSize: (limit: number) => void;
}) {
  return (
    <section aria-labelledby="playback-hours-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="playback-hours-heading" className="text-[15px] font-bold tracking-tight">
          Hour by hour
        </h2>
        <p className="text-[13px] text-fg-muted">
          One row per hour, delivery source, engine and packaging format — the
          detail the summary above is merged from, for narrowing down when
          something changed.
        </p>
      </div>
      <AdminTable<QoEBucket>
        label="Hourly playback quality"
        columns={HOURLY_COLUMNS}
        rows={buckets}
        rowKey={(bucket) =>
          `${bucket.hour_bucket}-${bucket.delivery_source}-${bucket.engine}-${bucket.packaging_format}`
        }
        density="compact"
        minWidth="72rem"
        empty={
          <EmptyState
            title="Nothing on this page"
            message="No rollup rows sit at this offset. Step back a page."
          />
        }
        footer={
          <AdminPagination
            total={total}
            limit={limit}
            offset={offset}
            onOffset={onOffset}
            onPageSize={onPageSize}
            label="hours"
          />
        }
      />
    </section>
  );
}

