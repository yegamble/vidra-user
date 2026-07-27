"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ChevronRightIcon, LibraryIcon, PlaylistIcon, PlusIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { VideoCardPreview } from "@/components/VideoCardPreview";
import {
  api,
  isSensitiveVideo,
  playlistThumbnailUrl,
  remoteVideoThumbnailUrl,
  videoOriginalUrl,
  videoThumbnailUrl,
} from "@/lib/api";
import type { HistoryItem, Playlist, Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRestrictedMode } from "@/lib/device-preferences";
import { useInstanceFeatures } from "@/lib/instance-features";
import { usePlayerSettings } from "@/lib/player-settings";
import { resumeFraction } from "@/lib/resume-progress";
import { useSensitiveContentPolicy } from "@/lib/use-sensitive-policy";

// LibraryView is the design's Library hub (Vidra App template): a History rail
// with real resume-progress, a Playlists list, and a Saved list — each bound to
// its own real endpoint (GET /me/history, /me/playlists, /me/saved). The
// standalone /history and /playlists routes remain the "See all" destinations.
//
// The session lives in memory, so a hard reload lands here signed out. Anonymous
// viewers still get a "Playlists" entry link (the /playlists route is reached
// from the Library page — the desktop sidebar no longer carries it) plus a
// sign-in prompt; only the data sections are gated. Authed and anonymous states
// each expose EXACTLY ONE "Playlists" link, so callers can address it uniquely.
export function LibraryView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-end">
          <PlaylistsLink />
        </div>
        <EmptyState
          icon={<LibraryIcon size={24} />}
          title="Sign in to see your library"
          message={
            <>
              <Link
                href="/login"
                className="focus-ring rounded font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
              >
                Sign in
              </Link>{" "}
              to save videos, build playlists, and pick up where you left off.
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-9">
      <HistorySection />
      <PlaylistsSection />
      <SavedSection />
    </div>
  );
}

// A quiet "Playlists" pill link — the single entry point to /playlists. Named
// exactly "Playlists" so it is addressable (the sidebar no longer links it).
function PlaylistsLink() {
  return (
    <Link
      href="/playlists"
      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
    >
      Playlists
      <ChevronRightIcon size={14} strokeWidth={2} className="text-fg-muted" />
    </Link>
  );
}

// A section heading with an optional right-aligned action (See all / New).
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex items-baseline justify-between gap-3">{children}</div>;
}

/* ── History rail ────────────────────────────────────────────────────────── */

// The design's History rail: a horizontal strip of 170px cards, each a 96px
// thumbnail carrying a thin WHITE resume-progress bar (position/duration — real,
// per the watch-history contract; omitted when there is no saved position) and a
// two-line title. Hidden entirely when there is nothing watched yet.
function HistorySection() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getWatchHistory({ limit: 12 }, controller.signal)
      .then((res) => {
        setItems(res.videos);
        setState("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  // A quiet progressive-enhancement rail: no spinner, no error UI — it simply
  // does not appear until there is history to show.
  if (state !== "ready" || items.length === 0) return null;

  return (
    <section aria-labelledby="library-history">
      <SectionHeader>
        <h2 id="library-history" className="text-[15px] font-bold tracking-tight text-fg">
          History
        </h2>
        <Link
          href="/history"
          className="focus-ring rounded text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          See all
        </Link>
      </SectionHeader>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {items.map((item) => (
          <li key={item.id} className="w-[170px] flex-none">
            <HistoryRailCard
              item={item}
              onDeleted={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryRailCard({ item, onDeleted }: { item: HistoryItem; onDeleted: () => void }) {
  const isRemote = item.remote === true;
  const href = isRemote ? `/remote/${item.id}` : `/videos/${item.id}`;
  const previewFeatureEnabled = useInstanceFeatures()?.video_card_previews === true;
  const previewPreferenceEnabled = usePlayerSettings().video_card_previews_enabled;
  const policy = useSensitiveContentPolicy();
  const restrictedMode = useRestrictedMode();
  const sensitive = isSensitiveVideo(item);
  const blurSensitive = sensitive && policy === "blur";
  const markSensitive = sensitive && (policy === "blur" || policy === "warn");
  const previewEligible =
    previewFeatureEnabled &&
    previewPreferenceEnabled &&
    !isRemote &&
    item.state === "published" &&
    item.privacy !== "private" &&
    item.privacy !== "password" &&
    !blurSensitive;
  const duration =
    typeof item.duration_seconds === "number" && item.duration_seconds > 0
      ? item.duration_seconds
      : null;
  // Shared finished-aware math: no bar below the resume floor or at >= ~95%
  // watched (finished videos read as unwatched here too).
  const resumeFrac = resumeFraction(item.position_seconds, item.duration_seconds);
  const progressPct =
    resumeFrac === null ? null : Math.min(100, Math.round(resumeFrac * 1000) / 10);

  if (sensitive && restrictedMode) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-muted px-3 text-center text-xs font-medium text-fg-muted">
        Hidden by Restricted Mode
      </div>
    );
  }

  return (
    <div className="group/card relative">
      <VideoCardPreview
        videoId={item.id}
        title={item.title}
        href={href}
        src={previewEligible ? videoOriginalUrl(item.id) : null}
        poster={
          item.has_thumbnail
            ? isRemote
              ? remoteVideoThumbnailUrl(item.id)
              : videoThumbnailUrl(item.id)
            : null
        }
        duration={duration}
        hasStoryboard={previewEligible}
        previewEnabled={previewEligible}
        className="rounded-xl"
        posterClassName={cn(
          "transition-transform group-hover/preview:scale-[1.02]",
          blurSensitive && "scale-110 blur-2xl",
        )}
        fallback={
          <div className="media-placeholder absolute inset-0 flex items-center justify-center text-[11px] text-fg-muted">
            No preview
          </div>
        }
        overlay={
          <>
            {markSensitive ? (
              <span
                title={item.sensitive_reason || undefined}
                className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white group-data-[preview-active=true]/preview:bottom-10"
              >
                Sensitive
              </span>
            ) : null}
            {progressPct !== null ? (
              // Thin WHITE resume bar directly on the thumbnail (design) — matching
              // VideoCard's history progress. It yields to the preview timeline.
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[3px] group-data-[preview-active=true]/preview:hidden"
              >
                <div
                  data-resume-progress={String(progressPct)}
                  style={{ width: `${progressPct}%` }}
                  className="h-full bg-white"
                />
              </div>
            ) : null}
          </>
        }
      />
      <Link href={href} className="focus-ring mt-2 block rounded-sm">
        <p className="line-clamp-2 pr-9 text-[13px] font-semibold leading-snug text-fg transition-colors group-hover/card:text-fg-muted">
          {item.title}
        </p>
      </Link>
      <div className="absolute bottom-0 right-0 z-10 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
        <VideoActionsMenu video={item} compact onDeleted={onDeleted} />
      </div>
    </div>
  );
}

/* ── Playlists ───────────────────────────────────────────────────────────── */

// The design's Playlists list: rows with an 84×48 cover (the filled playlist
// glyph when there is no cover image), the title, "N videos · Privacy", and a
// disclosure chevron. The header carries the single "Playlists" link (→ the full
// management page) and a "New" shortcut. The section header renders even while
// the list is loading or empty so the entry point is always present.
function PlaylistsSection() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyPlaylists(controller.signal)
      .then((res) => {
        setPlaylists(res.playlists);
        setState("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="library-playlists">
      <SectionHeader>
        <h2 id="library-playlists">
          <Link
            href="/playlists"
            className="focus-ring rounded text-[15px] font-bold tracking-tight text-fg transition-colors hover:text-fg-muted"
          >
            Playlists
          </Link>
        </h2>
        <Link
          href="/playlists"
          className="focus-ring inline-flex items-center gap-1 rounded text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          <PlusIcon size={14} strokeWidth={2.2} />
          New
        </Link>
      </SectionHeader>
      {state === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your playlists" />
        </div>
      ) : playlists.length === 0 ? (
        <p className="py-3 text-[13px] text-fg-muted">
          No playlists yet. Create one to organise videos.
        </p>
      ) : (
        <ul className="flex flex-col">
          {playlists.map((pl) => (
            <li key={pl.id}>
              <PlaylistRow playlist={pl} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PRIVACY_LABEL: Record<Playlist["visibility"], string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const count = `${playlist.video_count} ${playlist.video_count === 1 ? "video" : "videos"}`;
  return (
    <Link
      href={`/playlists/${playlist.id}`}
      className="focus-ring group flex items-center gap-3.5 rounded-[10px] py-2.5 transition-colors hover:bg-surface-muted sm:px-2"
    >
      <div className="media-placeholder relative flex h-12 w-[84px] flex-none items-center justify-center overflow-hidden rounded-[9px]">
        {playlist.has_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- backend-served cover
          <img
            src={playlistThumbnailUrl(playlist.id)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <PlaylistIcon size={18} className="text-fg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-fg">{playlist.title}</p>
        <p className="mt-0.5 text-[12.5px] text-fg-muted tabular-nums">
          {count} · {PRIVACY_LABEL[playlist.visibility]}
        </p>
      </div>
      <ChevronRightIcon
        size={15}
        strokeWidth={2}
        className="ml-auto flex-none text-fg-subtle transition-colors group-hover:text-fg-muted"
      />
    </Link>
  );
}

/* ── Saved ───────────────────────────────────────────────────────────────── */

// The design's Saved list: rows with a 112px thumbnail, a two-line title, and
// the channel. This is the Library page's home for saved videos ("watch later").
function SavedSection() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getSavedVideos({}, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setState("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="library-saved">
      <SectionHeader>
        <h2 id="library-saved" className="text-[15px] font-bold tracking-tight text-fg">
          Saved
        </h2>
      </SectionHeader>
      {state === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your library" />
        </div>
      ) : state === "error" ? (
        <p className="py-3 text-[13px] text-fg-muted">Could not load your saved videos.</p>
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon size={24} />}
          title="Your library is empty"
          message="Save videos with the Save button and they will show up here."
        />
      ) : (
        <ul className="flex flex-col">
          {videos.map((video) => (
            <li key={video.id}>
              <SavedRow
                video={video}
                onDeleted={() =>
                  setVideos((current) => current.filter((item) => item.id !== video.id))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedRow({ video, onDeleted }: { video: Video; onDeleted: () => void }) {
  const isRemote = video.remote === true;
  const href = isRemote ? `/remote/${video.id}` : `/videos/${video.id}`;
  const channelName = video.channel_display_name || video.channel_handle || "";
  const previewFeatureEnabled = useInstanceFeatures()?.video_card_previews === true;
  const previewPreferenceEnabled = usePlayerSettings().video_card_previews_enabled;
  const policy = useSensitiveContentPolicy();
  const restrictedMode = useRestrictedMode();
  const sensitive = isSensitiveVideo(video);
  const blurSensitive = sensitive && policy === "blur";
  const markSensitive = sensitive && (policy === "blur" || policy === "warn");
  const previewEligible =
    previewFeatureEnabled &&
    previewPreferenceEnabled &&
    !isRemote &&
    video.state === "published" &&
    video.privacy !== "private" &&
    video.privacy !== "password" &&
    !blurSensitive;
  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;

  if (sensitive && restrictedMode) {
    return (
      <div className="flex min-h-[72px] items-center justify-center rounded-[9px] bg-surface-muted px-3 text-center text-xs font-medium text-fg-muted">
        Hidden by Restricted Mode
      </div>
    );
  }

  return (
    <div className="group/card relative flex items-center gap-3 py-2.5">
      <div className="w-[112px] flex-none">
        <VideoCardPreview
          videoId={video.id}
          title={video.title}
          href={href}
          src={previewEligible ? videoOriginalUrl(video.id) : null}
          poster={
            video.has_thumbnail
              ? isRemote
                ? remoteVideoThumbnailUrl(video.id)
                : videoThumbnailUrl(video.id)
              : null
          }
          duration={duration}
          hasStoryboard={previewEligible}
          previewEnabled={previewEligible}
          className="rounded-[9px]"
          posterClassName={cn(
            "transition-transform group-hover/preview:scale-[1.02]",
            blurSensitive && "scale-110 blur-2xl",
          )}
          fallback={
            <div className="media-placeholder absolute inset-0 flex items-center justify-center text-[11px] text-fg-muted">
              No preview
            </div>
          }
          overlay={
            markSensitive ? (
              <span
                title={video.sensitive_reason || undefined}
                className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white group-data-[preview-active=true]/preview:bottom-10"
              >
                Sensitive
              </span>
            ) : null
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold leading-snug text-fg">
          <Link
            href={href}
            className="focus-ring line-clamp-2 rounded-sm transition-colors group-hover/card:text-fg-muted"
          >
            {video.title}
          </Link>
        </h3>
        {channelName ? (
          isRemote ? (
            <span className="mt-1 block truncate text-[12px] text-fg-muted">{channelName}</span>
          ) : (
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring relative z-10 mt-1 inline-block max-w-full truncate rounded text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              {channelName}
            </Link>
          )
        ) : null}
      </div>
      <div className="relative z-20 -mr-1 shrink-0 self-end opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
        <VideoActionsMenu video={video} compact onDeleted={onDeleted} />
      </div>
    </div>
  );
}
