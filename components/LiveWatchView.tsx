"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useFormat, useT } from "@/components/I18nProvider";
import { useOptionalSession } from "@/components/auth/AuthProvider";
import { LiveTerminateDialog } from "@/components/LiveTerminateDialog";
import { InfoIcon } from "@/components/icons";
import { QualityMenu } from "@/components/QualityMenu";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { UserText } from "@/components/UserText";
import { ApiError, api } from "@/lib/api";
import type { Translate } from "@/lib/i18n";
import type { LiveStream } from "@/lib/api";
import { formatCountdown } from "@/lib/format";
import { terminationHeadline } from "@/lib/live/termination";
import { useNow } from "@/lib/live/use-now";
import { useLivePlayback } from "@/lib/use-playback-engine";
import { useSettledOptionalSession } from "@/lib/use-settled-session";

type Status = "loading" | "error" | "notfound" | "ready";

// How often to re-check an offline stream so a waiting viewer sees it go live
// without a manual refresh.
const OFFLINE_POLL_MS = 15_000;

// How often to re-read a stream that IS live.
//
// A26 measured what its absence costs: the page rendered `0 viewers` at load and
// never moved, while the API's count reached 3 and decayed back to 2 exactly as
// designed — and a moderator's termination did not reach the viewer's page at
// all until they reloaded, so a broadcast that had been taken off the air went on
// showing a live badge over a player that had stopped.
//
// Ten seconds matches core's own read cache on the count (internal/live's
// viewerCountRefresh), so a faster cadence would buy a viewer nothing but round
// trips: the answer cannot change more often than that. It is slower than the
// player's ~2 s playlist refresh on purpose — this read is the page's metadata,
// not the video, and the video is what has to be timely.
const LIVE_POLL_MS = 10_000;

// How long past its planned start a stream still reads as upcoming (core's
// Upcoming listing uses the same one-hour window).
const UPCOMING_GRACE_MS = 3_600_000;

// LiveWatchView is the /live/[id] watch surface. It loads a single live stream
// and, when it is live with an HLS playlist available, plays it via the shared
// HLS util (hls.js over MSE / native HLS). Offline and ended states are shown
// honestly — a stream that has not started, or has finished, never pretends to
// play. A 404 (no such stream, or private and not the viewer's) is its own state.
export function LiveWatchView({ id }: { id: string }) {
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [stream, setStream] = useState<LiveStream | null>(null);
  // A PRIVATE stream is visible only to its owner (and the channel's content
  // managers); core 404s it for everyone else. Reading before the refresh
  // cookie has been redeemed reads anonymously, so the owner's own stream page
  // landed on "not found" and the effect never re-ran to correct it.
  // `useSettledOptionalSession` because the view is also rendered bare.
  const { settled, viewerKey } = useSettledOptionalSession();
  // Staff get the termination control. This is where a moderator watching an
  // instance-damaging broadcast actually is — sending them to an admin page to
  // find the stream by id would be a worse answer than no control at all, which
  // was the previous state.
  const session = useOptionalSession();
  const staff = session?.user?.role === "admin" || session?.user?.role === "moderator";
  const [terminating, setTerminating] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      api
        .getLiveStream(id, signal)
        .then((s) => {
          setStream(s);
          setStatus("ready");
        })
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
        }),
    [id],
  );

  useEffect(() => {
    if (!settled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, settled, viewerKey]);

  // One poll, two cadences, and a stream that has ENDED gets none: an ended
  // stream is the only state nothing can move it out of without a new session,
  // and polling it forever would be one request every ten seconds, per viewer,
  // for as long as anyone leaves the tab open.
  const pollMs =
    status !== "ready"
      ? 0
      : stream?.state === "offline"
        ? OFFLINE_POLL_MS
        : stream?.state === "live"
          ? LIVE_POLL_MS
          : 0;
  useEffect(() => {
    if (!pollMs) return;
    const controller = new AbortController();
    // ONE request in flight at a time. Without this a slow instance turns a
    // watch page into an ever-growing pile of overlapping reads: the interval
    // does not wait for the answer, so a 30-second response on a 10-second
    // cadence has three outstanding before the first returns.
    let inFlight = false;
    const tick = () => {
      // A backgrounded tab is not watching. This is the same judgement the
      // 90-second viewer window makes on the server: a locked phone should not
      // vanish from the count, but it should not be paying for polls either.
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      void load(controller.signal).finally(() => {
        inFlight = false;
      });
    };
    const timer = setInterval(tick, pollMs);
    // Coming back to the tab is worth a read immediately rather than up to a
    // cadence later — it is exactly when the page is most likely to be stale.
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      controller.abort();
    };
  }, [pollMs, load]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label={t("live.watch.loading")} />
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <EmptyState
        title={t("live.watch.notFound.title")}
        message={t("live.watch.notFound.message")}
      />
    );
  }
  if (status === "error" || stream === null) {
    return <ErrorState message={t("live.watch.error")} onRetry={() => void load()} />;
  }

  const channelName = stream.channel_display_name || stream.channel_handle;
  // A scheduled start is an ANNOUNCEMENT: only an offline stream shows it, and
  // it never replaces the real state — when the encoder connects the poll above
  // flips the page to the player on its own.
  const upcoming =
    stream.state === "offline" && !stream.termination && stream.scheduled_start_at
      ? stream.scheduled_start_at
      : null;

  return (
    <div className="flex flex-col gap-4">
      {stream.state === "live" && stream.hls_url ? (
        <LivePlayer stream={stream} />
      ) : stream.state === "live" ? (
        // Live, but no playlist path yet (media server not serving it): honest,
        // not a dead player. The offline poll does not run here, so offer Refresh.
        <StreamState
          title={t("live.watch.noFeed.title")}
          message={t("live.watch.noFeed.message")}
          onRefresh={() => void load()}
        />
      ) : stream.state === "ended" || stream.termination ? (
        // A stream that was ENDED BY A PERSON says so, and says why. Before
        // this, a moderator termination was indistinguishable from a publisher
        // dropping off: the page read "This live stream has ended" and the only
        // person the action was aimed at was told nothing at all. `termination`
        // is present only for the creator, a channel content manager and staff
        // (core gates it), so a public visitor still sees the plain sentence.
        //
        // The condition takes `termination` as well as the state because a
        // PERMANENT stream returns to `offline` rather than `ended` when it is
        // terminated — it is reusable — and the reason has to survive that.
        <StreamState
          title={t("live.watch.ended.title")}
          message={endedMessage(stream, t)}
          onRefresh={() => void load()}
        />
      ) : upcoming ? (
        <UpcomingState at={upcoming} />
      ) : (
        <StreamState
          title={t("live.watch.notYet.title")}
          message={t("live.watch.notYet.message")}
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {stream.state === "live" ? <LiveBadge /> : null}
          {upcoming ? <UpcomingBadge at={upcoming} /> : null}
          {stream.state === "live" && typeof stream.viewer_count === "number" ? (
            <ViewerCount count={stream.viewer_count} />
          ) : null}
          <h1 className="text-[17px] font-bold leading-snug tracking-[-0.015em] sm:text-[19px]">
            {stream.title}
          </h1>
          {staff && stream.state === "live" ? (
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => setTerminating(true)}
              className="ml-auto"
            >
              {t("live.watch.endStream")}
            </Button>
          ) : null}
        </div>
        {channelName ? (
          <p className="text-[13px] text-fg-muted">
            {stream.channel_handle ? (
              <Link
                href={`/channels/${encodeURIComponent(stream.channel_handle)}`}
                className="focus-ring rounded font-semibold text-fg hover:underline"
              >
                {channelName}
              </Link>
            ) : (
              channelName
            )}
          </p>
        ) : null}
        {stream.description ? (
          <UserText
            variant="description"
            text={stream.description}
            className="text-sm leading-relaxed text-fg-muted"
          />
        ) : null}
      </div>

      {terminating ? (
        <LiveTerminateDialog
          streamId={stream.id}
          streamTitle={stream.title}
          onClose={() => setTerminating(false)}
          onTerminated={() => void load()}
        />
      ) : null}
    </div>
  );
}

// LivePlayer plays the live HLS feed via the shared decision helpers. There is no
// progressive fallback for a live stream, so a fatal playback failure shows an
// honest message instead of a dead <video>.
function LivePlayer({ stream }: { stream: LiveStream }) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playback = useLivePlayback(videoRef, stream.id);

  if (playback.failed) {
    return (
      <StreamState
        title={t("live.watch.playFail.title")}
        message={t("live.watch.playFail.message")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        aria-label={t("live.watch.playerLabel", { title: stream.title })}
        className="aspect-video w-full rounded-2xl bg-black"
        src={playback.src}
      >
        {t("live.watch.noVideoTag")}
      </video>
      {/* Only hls.js playback exposes controllable quality; the menu hides itself
          for native-HLS playback (levels is empty). Sharing VOD's lifecycle also
          gives live the "Auto (720p)" readout and the busy "…" on a pick that
          has not landed yet — both come straight off LEVEL_SWITCHED. */}
      <div className="flex flex-wrap items-center gap-2">
        <QualityMenu
          levels={playback.levels}
          currentQuality={playback.currentQuality}
          activeHeight={playback.activeHeight}
          pending={playback.pending}
          onSelect={playback.setQuality}
        />
      </div>
    </div>
  );
}

function StreamState({
  title,
  message,
  onRefresh,
}: {
  title: string;
  message: string;
  onRefresh?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface-muted px-6 py-16 text-center">
      <InfoIcon size={20} strokeWidth={2} className="text-fg-muted" />
      <p className="text-[15px] font-bold tracking-tight text-fg">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">{message}</p>
      {onRefresh ? (
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          {t("live.watch.refresh")}
        </Button>
      ) : null}
    </div>
  );
}

// UpcomingState is the offline watch surface of a stream with a planned start:
// the start time in the viewer's locale and a coarse countdown. The countdown is
// a courtesy — the stream starts when the broadcaster connects, so a start time
// that passes just reads "Starting soon" and the page keeps waiting.
function UpcomingState({ at }: { at: string }) {
  const t = useT();
  const { formatDateTime } = useFormat();
  const now = useNow(true);
  // Core stops listing a start once it is more than an hour stale; match that
  // window here, then fall back to the plain not-live state instead of reading
  // "Starting soon" for days.
  if (now.getTime() - new Date(at).getTime() > UPCOMING_GRACE_MS) {
    return (
      <StreamState
        title={t("live.watch.notYet.title")}
        message={t("live.watch.notYet.message")}
      />
    );
  }
  const countdown = formatCountdown(at, now);
  return (
    <StreamState
      title={t("live.watch.upcoming.title")}
      message={
        countdown
          ? t("live.watch.upcoming.withCountdown", { when: formatDateTime(at), countdown })
          : t("live.watch.upcoming.message", { when: formatDateTime(at) })
      }
    />
  );
}

function UpcomingBadge({ at }: { at: string }) {
  const t = useT();
  const now = useNow(true);
  if (now.getTime() - new Date(at).getTime() > UPCOMING_GRACE_MS) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-surface-strong px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-fg-muted">
      {t("live.upcoming.label")}
    </span>
  );
}

// endedMessage is what a stopped stream says. The termination sentence comes
// first because it is the answer to the question the creator actually has, and
// the moderator's own words follow it — the code says WHAT rule, the free text
// says what happened.
function endedMessage(stream: LiveStream, t: Translate): string {
  const parts: string[] = [];
  if (stream.termination) {
    parts.push(terminationHeadline(stream.termination));
    if (stream.termination.reason) parts.push(stream.termination.reason);
  } else {
    parts.push(t("live.watch.ended.message"));
  }
  if (stream.replay_enabled) {
    parts.push(t("live.watch.ended.replay"));
  }
  return parts.join(" ");
}

// ViewerCount renders the concurrent-viewer number. It is only ever rendered
// when core actually sent one: the field is OMITTED rather than zeroed on an
// instance that cannot measure it, so `typeof === "number"` at the call site is
// what keeps a creator from being shown a confident "0 watching" by an instance
// with no Redis.
function ViewerCount({ count }: { count: number }) {
  const t = useT();
  return (
    <span className="text-[12.5px] font-medium text-fg-muted" aria-live="polite">
      {t("live.watch.viewers", { count })}
    </span>
  );
}

function LiveBadge() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-danger">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-live animate-[live-pulse_1.6s_ease-in-out_infinite]"
      />
      {t("live.rail.badge")}
    </span>
  );
}
