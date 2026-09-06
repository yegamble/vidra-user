"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { AdminPagination } from "@/components/admin/AdminControls";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { ListSearch, ListToolbar, type SortOption } from "@/components/admin/ListToolbar";
import {
  CaptionsIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  SlashCircleIcon,
  TrashIcon,
  VideoIcon,
} from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Dropdown, useToast, type DropdownItem } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FilterChip,
  FilterChipGroup,
  FilterChipMultiGroup,
  TriStateFilter,
  triStateValue,
  type TriState,
} from "@/components/ui/FilterChips";
import { FilterField, FilterPanel } from "@/components/ui/FilterPanel";
import { Input } from "@/components/ui/Input";
import {
  api,
  errorMessage,
  remoteVideoThumbnailUrl,
  videoThumbnailUrl,
  type AdminVideo,
  type AdminVideoScope,
  type AdminVideoSort,
  type VideoPrivacy,
  type VideoState,
} from "@/lib/api";
import { formatBytes, formatCount, formatDateTime, formatDuration, pluralize } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

/**
 * The orderings offered, out of the eighteen the endpoint accepts. The two that
 * are missing are `published_at` / `-published_at`, which the contract documents
 * as ALIASES of `created_at`: videos carry no separate published_at column, so
 * offering both spellings would put two identical options in one picker.
 */
const SORT_OPTIONS: readonly SortOption[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-views", label: "Most viewed" },
  { value: "views", label: "Least viewed" },
  { value: "-likes", label: "Most liked" },
  { value: "likes", label: "Least liked" },
  { value: "-comments", label: "Most commented" },
  { value: "comments", label: "Least commented" },
  { value: "-duration", label: "Longest" },
  { value: "duration", label: "Shortest" },
  { value: "-size_bytes", label: "Largest files" },
  { value: "size_bytes", label: "Smallest files" },
  { value: "title", label: "Title A–Z" },
  { value: "-title", label: "Title Z–A" },
  { value: "state", label: "State A–Z" },
  { value: "-state", label: "State Z–A" },
];

const DEFAULT_SORT = "-created_at";

const STATE_OPTIONS: readonly { value: VideoState; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "processing", label: "Processing" },
  { value: "transcoding", label: "Transcoding" },
  { value: "scheduled", label: "Scheduled" },
  { value: "quarantined", label: "Quarantined" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
];

const PRIVACY_OPTIONS: readonly { value: VideoPrivacy; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
  { value: "password", label: "Password" },
];

const SCOPE_OPTIONS: readonly { value: AdminVideoScope; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "local", label: "Local only" },
  { value: "remote", label: "Federated only" },
];

/**
 * One-click state selections for the questions moderators actually arrive with.
 * "Transcoding" is the headline one — "is it transcoded or still waiting" is the
 * reason someone opens this page during an upload backlog, and answering it
 * otherwise means opening the panel and ticking two of seven states.
 */
const PRESETS: readonly { id: string; label: string; states: readonly VideoState[] }[] = [
  { id: "transcoding", label: "Transcoding", states: ["processing", "transcoding"] },
  { id: "failed", label: "Failed", states: ["failed"] },
  { id: "quarantined", label: "Held for review", states: ["quarantined"] },
];

const FILTER_KEYS = [
  "q",
  "state",
  "privacy",
  "scope",
  "channel",
  "after",
  "before",
  "original",
  "hls",
  "web",
] as const;

/** Split a comma-joined URL filter back into the values it holds. */
function listOf<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  if (!value) return [];
  const set = new Set<string>(allowed);
  return value.split(",").filter((v): v is T => set.has(v));
}

/**
 * `<input type="datetime-local">` speaks local wall-clock time with no zone; the
 * API wants RFC3339. Returns undefined for an unparseable draft so a half-typed
 * date never becomes a filter.
 */
function toInstant(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function AdminVideosView() {
  return (
    <RoleGate minRole="moderator" action="manage videos">
      <ListBoundary label="videos">
        <VideosList />
      </ListBoundary>
    </RoleGate>
  );
}

function VideosList() {
  const list = usePagedList<AdminVideo>({
    defaultSort: DEFAULT_SORT,
    filterKeys: FILTER_KEYS,
    load: (query, signal) => {
      const after = toInstant(query.filters.after);
      const before = toInstant(query.filters.before);
      // The endpoint answers an inverted window with a 400, not an empty page.
      // Catching it here keeps the doomed request off the wire and lets the view
      // say which two fields disagree instead of showing "could not load".
      if (after && before && after > before) throw new Error("inverted publish window");
      return api
        .getAdminVideos(
          {
            q: query.filters.q,
            sort: (query.sort || DEFAULT_SORT) as AdminVideoSort,
            state: listOf(query.filters.state, STATE_OPTIONS.map((o) => o.value)),
            privacy: listOf(query.filters.privacy, PRIVACY_OPTIONS.map((o) => o.value)),
            scope: (query.filters.scope as AdminVideoScope | undefined) ?? undefined,
            channel: query.filters.channel,
            publishedAfter: after,
            publishedBefore: before,
            hasOriginal: triStateValue(query.filters.original),
            hasHls: triStateValue(query.filters.hls),
            hasWebFiles: triStateValue(query.filters.web),
            limit: query.limit,
            offset: query.offset,
          },
          signal,
        )
        .then((res) => ({
          items: res.videos,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        }));
    },
  });

  const { filters, setFilter, setFilters, patch, drop } = list;
  const states = useMemo(
    () => listOf(filters.state, STATE_OPTIONS.map((o) => o.value)),
    [filters.state],
  );
  const privacies = useMemo(
    () => listOf(filters.privacy, PRIVACY_OPTIONS.map((o) => o.value)),
    [filters.privacy],
  );
  const after = toInstant(filters.after);
  const before = toInstant(filters.before);
  const invertedWindow = Boolean(after && before && after > before);

  // The search term is its own control in the toolbar, so it must not also be
  // counted by the Filters badge — that badge answers "how much is the panel
  // hiding from me", and the search box is never hidden.
  const panelFilterCount = list.activeFilterCount - (filters.q ? 1 : 0);

  const onChanged = useCallback(
    (next: AdminVideo) =>
      patch((items) =>
        items.map((v) => (v.id === next.id && v.is_local === next.is_local ? next : v)),
      ),
    [patch],
  );

  const columns = useMemo<readonly AdminTableColumn<AdminVideo>[]>(
    () => [
      {
        key: "video",
        header: "Video",
        cell: (video) => <VideoCell video={video} />,
      },
      {
        key: "info",
        header: "Info",
        cell: (video) => <InfoCell video={video} />,
      },
      {
        key: "files",
        header: "Files",
        cell: (video) => <FilesCell video={video} />,
      },
      {
        key: "engagement",
        header: "Engagement",
        cellClassName: "whitespace-nowrap text-xs tabular-nums text-fg-muted",
        cell: (video) => <EngagementCell video={video} />,
      },
      {
        key: "published",
        header: "Published",
        cellClassName: "whitespace-nowrap text-xs tabular-nums text-fg-muted",
        cell: (video) => formatDateTime(video.published_at),
      },
      {
        key: "actions",
        header: "Actions",
        align: "end",
        srOnlyHeader: true,
        cell: (video) => (
          <ModerationActions
            video={video}
            onChanged={onChanged}
            onRemoved={() =>
              drop((v) => v.id !== video.id || v.is_local !== video.is_local)
            }
          />
        ),
      },
    ],
    [drop, onChanged],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold tabular-nums text-fg-muted">
          {/* The server's total for these filters — never the number of rows
              this page happens to hold, which is how this line came to read
              "100 videos" on an instance with far more. */}
          {list.status === "ready"
            ? `${list.total} ${pluralize(list.total, "video")}`
            : "Videos"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-muted">Quick filters</span>
          {PRESETS.map((preset) => {
            const active =
              states.length === preset.states.length &&
              preset.states.every((s) => states.includes(s));
            return (
              <FilterChip
                key={preset.id}
                size="sm"
                active={active}
                onClick={() => setFilter("state", active ? "" : preset.states.join(","))}
              >
                {preset.label}
              </FilterChip>
            );
          })}
        </div>
      </div>

      <ListToolbar
        search={
          <ListSearch
            label="Search videos by title"
            placeholder="Search videos"
            value={filters.q ?? ""}
            onSubmit={(next) => setFilter("q", next)}
          />
        }
        sort={{
          value: list.sort || DEFAULT_SORT,
          onChange: list.setSort,
          options: SORT_OPTIONS,
        }}
        filters={
          <FilterPanel
            activeCount={panelFilterCount}
            defaultOpen={panelFilterCount > 0}
            columns={2}
            footer={
              panelFilterCount > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setFilters({
                      state: "",
                      privacy: "",
                      scope: "",
                      channel: "",
                      after: "",
                      before: "",
                      original: "",
                      hls: "",
                      web: "",
                    })
                  }
                >
                  Clear filters
                </Button>
              ) : null
            }
          >
            <FilterField
              label="Lifecycle state"
              hint="Nothing selected means every state."
              render={(id) => (
                <FilterChipMultiGroup<VideoState>
                  labelledBy={id}
                  size="sm"
                  options={STATE_OPTIONS}
                  values={states}
                  onChange={(next) => setFilter("state", next.join(","))}
                />
              )}
            />
            <FilterField
              label="Privacy"
              hint="Nothing selected means every tier."
              render={(id) => (
                <FilterChipMultiGroup<VideoPrivacy>
                  labelledBy={id}
                  size="sm"
                  options={PRIVACY_OPTIONS}
                  values={privacies}
                  onChange={(next) => setFilter("privacy", next.join(","))}
                />
              )}
            />
            <FilterField
              label="Where it is hosted"
              render={(id) => (
                <FilterChipGroup<AdminVideoScope>
                  labelledBy={id}
                  size="sm"
                  options={SCOPE_OPTIONS}
                  value={(filters.scope as AdminVideoScope | undefined) ?? "all"}
                  onChange={(next) => setFilter("scope", next === "all" ? "" : next)}
                />
              )}
            />
            <Input
              label="Channel handle"
              placeholder="ada — or films@remote.example"
              hint="Exact handle. Federated rows match on name@domain."
              value={filters.channel ?? ""}
              onChange={(e) => setFilter("channel", e.target.value)}
            />
            <Input
              label="Published after"
              type="datetime-local"
              value={filters.after ?? ""}
              onChange={(e) => setFilter("after", e.target.value)}
            />
            <Input
              label="Published before"
              type="datetime-local"
              error={invertedWindow ? "Ends before it starts." : undefined}
              value={filters.before ?? ""}
              onChange={(e) => setFilter("before", e.target.value)}
            />
            <TriStateFilter
              label="Original file retained"
              value={(filters.original as TriState) ?? ""}
              onChange={(next) => setFilter("original", next)}
            />
            <TriStateFilter
              label="HLS renditions"
              value={(filters.hls as TriState) ?? ""}
              onChange={(next) => setFilter("hls", next)}
            />
            <TriStateFilter
              label="Progressive web files"
              value={(filters.web as TriState) ?? ""}
              onChange={(next) => setFilter("web", next)}
            />
          </FilterPanel>
        }
      />

      {invertedWindow ? (
        <p role="alert" className="text-sm text-danger">
          The publish window ends before it starts — “Published before” is earlier
          than “Published after”, so no video could ever match. Widen one of them.
        </p>
      ) : (
        <AdminTable<AdminVideo>
          label="Videos"
          status={list.status === "ready" ? "idle" : list.status}
          columns={columns}
          rows={list.items}
          rowKey={(video) => `${video.is_local ? "local" : "remote"}-${video.id}`}
          errorMessage="Could not load videos."
          onRetry={list.reload}
          minWidth="78rem"
          empty={
            <EmptyState
              title={
                list.pageOffset > 0
                  ? "Nothing on this page"
                  : list.activeFilterCount > 0
                    ? "No matching videos"
                    : "No videos yet"
              }
              message={
                list.pageOffset > 0
                  ? "No videos sit at this offset any more. Step back a page."
                  : list.activeFilterCount > 0
                    ? "Try widening the filters, or clearing the search."
                    : "Videos will appear here as they are published."
              }
            />
          }
          footer={
            <AdminPagination
              total={list.total}
              limit={list.pageLimit}
              offset={list.pageOffset}
              onOffset={list.setOffset}
              onPageSize={list.setLimit}
              label="videos"
            />
          }
        />
      )}
    </div>
  );
}

/**
 * FilterField — a label + hint wrapper for a filter whose control is a chip row
 * rather than a form field (chips have no `<label>` to hang off, so the caption
 * names the group through `aria-labelledby`).
 */
const PILL = "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em]";

function VideoCell({ video }: { video: AdminVideo }) {
  const href = video.is_local ? `/videos/${video.id}` : `/remote/${video.id}`;
  const thumbnail = video.is_local ? videoThumbnailUrl(video.id) : remoteVideoThumbnailUrl(video.id);
  return (
    <div className="flex w-[30rem] items-center gap-3">
      <Link href={href} className="relative h-[4.3rem] w-[7.5rem] shrink-0 overflow-hidden rounded-lg bg-surface-muted">
        {video.has_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated backend media URL
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-fg-muted"><VideoIcon size={24} /></span>
        )}
        {typeof video.duration_seconds === "number" ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
            {formatDuration(video.duration_seconds)}
          </span>
        ) : null}
      </Link>
      <div className="min-w-0">
        <Link href={href} className="focus-ring line-clamp-2 rounded font-semibold leading-snug text-fg hover:underline">
          {video.title || "Untitled video"}
        </Link>
        <Link
          href={video.is_local ? `/channels/${video.channel_handle}` : href}
          className="mt-1 block truncate text-[13px] text-fg-muted hover:text-fg"
        >
          {video.channel_display_name || video.channel_handle}
        </Link>
      </div>
    </div>
  );
}

function InfoCell({ video }: { video: AdminVideo }) {
  return (
    <div className="flex max-w-[19rem] flex-wrap gap-1.5">
      <Pill className="bg-surface-strong text-fg-muted">
        {video.is_local ? "Local" : "Federated"}
      </Pill>
      <Pill className={video.privacy === "public" ? "bg-success/15 text-success" : "bg-surface-strong text-fg-muted"}>
        {video.privacy}
      </Pill>
      {video.sensitive ? <Pill className="bg-danger/15 text-danger">Sensitive</Pill> : null}
      {video.external_link ? <Pill className="bg-surface-strong text-fg-muted">External link</Pill> : null}
      {video.state !== "published" ? <Pill className="bg-warning/15 text-warning">{video.state}</Pill> : null}
      {video.blocked ? <Pill className="bg-danger/15 text-danger">Blocked</Pill> : null}
      {/* The moderator's own rejection note. A rejected video has left the
          quarantine queue, so this row is the only staff surface it still
          appears on — and until migration 0130 the note was discarded outright
          while the reject dialog said it was "recorded in the audit trail".
          Staff-only: the creator gets the same text on their notification, and
          nobody else sees this endpoint at all. */}
      {video.moderation_note ? (
        <span className="w-full pt-1 text-xs text-fg-muted">
          <span className="font-semibold text-danger">Rejected:</span> {video.moderation_note}
        </span>
      ) : null}
      {!video.is_local && video.origin_domain ? (
        <span className="w-full truncate pt-1 text-xs text-fg-muted" title={video.origin_domain}>{video.origin_domain}</span>
      ) : null}
    </div>
  );
}

function FilesCell({ video }: { video: AdminVideo }) {
  if (!video.is_local) return <span className="text-xs text-fg-muted">Hosted by origin</span>;
  return (
    <div className="flex max-w-[22rem] flex-wrap items-center gap-1.5">
      {video.has_original ? <Pill className="bg-surface-strong text-fg-muted">Original</Pill> : null}
      {video.hls_count > 0 ? <Pill className="bg-surface-strong text-fg-muted">HLS ({video.hls_count})</Pill> : null}
      {video.web_video_count > 0 ? <Pill className="bg-surface-strong text-fg-muted">Web Videos ({video.web_video_count})</Pill> : null}
      {video.object_storage ? <Pill className="bg-surface-strong text-fg-muted">Object storage</Pill> : null}
      <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-fg-muted">{formatBytes(video.size_bytes)}</span>
    </div>
  );
}

/**
 * Views / likes / comments — the three numbers the sort picker can order by, so
 * an operator can see the column they just sorted on. Likes and comments are
 * local-only counters; a federated row reads "—" rather than 0, which would say
 * "nobody liked it" instead of "this server does not count that".
 */
function EngagementCell({ video }: { video: AdminVideo }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{formatCount(video.views)} views</span>
      {video.is_local ? (
        <span>
          {formatCount(video.likes ?? 0)} likes<span aria-hidden> · </span>
          {formatCount(video.comments ?? 0)} comments
        </span>
      ) : (
        <span title="Likes and comments are local counters; a federated row has none.">—</span>
      )}
    </span>
  );
}

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`${PILL} ${className}`}>{children}</span>;
}

function ActionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="flex items-center gap-3"><span className="flex w-5 justify-center text-fg-muted">{icon}</span>{children}</span>;
}

function ModerationActions({ video, onChanged, onRemoved }: {
  video: AdminVideo;
  onChanged: (video: AdminVideo) => void;
  onRemoved: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = (label: string, operation: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    void operation()
      .then(() => {
        after?.();
        toast({ message: label, variant: "success" });
      })
      .catch((err: unknown) => toast({ message: errorMessage(err, `Could not ${label.toLowerCase()}.`), variant: "error" }))
      .finally(() => setBusy(false));
  };

  const block = () => run(
    video.blocked ? "Video unblocked." : "Video blocked.",
    () => video.is_local
      ? (video.blocked ? api.unblockVideo(video.id) : api.blockVideo(video.id))
      : (video.blocked ? api.unblockRemoteVideo(video.id) : api.blockRemoteVideo(video.id)),
    () => onChanged({ ...video, blocked: !video.blocked }),
  );

  const items: DropdownItem[] = [];
  if (video.is_local) {
    items.push({
      label: <ActionLabel icon={<VideoIcon size={18} />}>Manage</ActionLabel>,
      onSelect: () => router.push(`/studio?video=${encodeURIComponent(video.id)}`),
      disabled: busy,
    });
  } else if (video.watch_url) {
    items.push({
      label: <ActionLabel icon={<ExternalLinkIcon size={18} />}>Open origin</ActionLabel>,
      onSelect: () => window.open(video.watch_url, "_blank", "noopener,noreferrer"),
      disabled: busy,
    });
  }
  items.push({
    label: <ActionLabel icon={<SlashCircleIcon size={18} />}>{video.blocked ? "Unblock" : "Block"}</ActionLabel>,
    onSelect: block,
    disabled: busy,
  });
  if (video.is_local) {
    items.push(
      {
        label: <ActionLabel icon={<TrashIcon size={18} />}>Delete</ActionLabel>,
        onSelect: () => {
          if (!window.confirm(`Delete “${video.title}” and all of its media?`)) return;
          run("Video deleted.", () => api.deleteVideo(video.id), onRemoved);
        },
        danger: true,
        disabled: busy,
      },
      {
        label: <ActionLabel icon={<SettingsIcon size={18} />}>Run HLS transcoding</ActionLabel>,
        onSelect: () => run("HLS transcoding queued.", () => api.runVideoTranscoding(video.id, "hls")),
        disabled: busy || !video.has_original,
      },
      {
        label: <ActionLabel icon={<SettingsIcon size={18} />}>Run Web Video transcoding</ActionLabel>,
        onSelect: () => run("Web Video transcoding queued.", () => api.runVideoTranscoding(video.id, "web_video")),
        disabled: busy || !video.has_original,
      },
      {
        label: <ActionLabel icon={<CaptionsIcon size={18} />}>Generate caption</ActionLabel>,
        onSelect: () => run("Caption generation queued.", () => api.requestAutoCaption(video.id)),
        disabled: busy || !video.has_original,
      },
    );
  }

  return (
    <Dropdown
      trigger={<MoreHorizontalIcon size={24} />}
      triggerLabel={`Actions for ${video.title}`}
      items={items}
      align="end"
      triggerVariant="icon"
      triggerClassName="h-10 w-10"
    />
  );
}
