"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PlaylistIcon, SearchIcon, TrashIcon, VideoIcon } from "@/components/icons";
import { Alert, Button, Dropdown, EmptyState, ErrorState, Input, Modal, Select, Spinner } from "@/components/ui";
import { ListTail } from "@/components/ui/ListTail";
import { api, errorMessage } from "@/lib/api";
import type { Channel, Video, VideoConfigResponse, VideoPrivacy, VideoState } from "@/lib/api";
import { videoAcceptAttr } from "@/lib/upload-accept";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListQuery } from "@/lib/use-list-query";

import { BulkAddToPlaylistDialog } from "./BulkAddToPlaylistDialog";
import { VideoRow } from "./VideoRow";

// The filters live in the URL (`mv_q`, `mv_privacy`, `mv_state`, `mv_channel`),
// so a reload, Back or a shared link restores the same view.
const FILTER_KEYS = ["q", "privacy", "state", "channel"] as const;

const PRIVACIES: { value: VideoPrivacy; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
  { value: "internal", label: "Internal" },
  { value: "password", label: "Password" },
];
// "password" needs a stored password per video, so it is a filter value only;
// bulk-setting it would fail every item.
const BULK_PRIVACIES = PRIVACIES.filter((p) => p.value !== "password");

const STATES: { value: VideoState; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "processing", label: "Processing" },
  { value: "transcoding", label: "Transcoding" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "quarantined", label: "Quarantined" },
  { value: "failed", label: "Failed" },
];

type Summary = {
  kind: "success" | "warning" | "danger";
  message: string;
  failures: { id: string; title: string; error: string }[];
};

const NO_SELECTION: ReadonlySet<string> = new Set();

// MyVideosManager is the Studio "Your videos" list for an account's OWN
// channels: debounced title search, privacy / state / channel filters held in
// the URL, row selection, and a bulk bar (delete, change privacy, add to
// playlist). It reads GET /me/videos and acts through POST /me/videos/bulk, so
// every item runs the same server pipeline as the single-video routes.
export function MyVideosManager({
  config,
  channels,
}: {
  config: VideoConfigResponse | null;
  /** The caller's OWN channels (the channel filter's options). */
  channels: Channel[];
}) {
  const autoLoad = useBrowseAutoLoad();
  const query = useListQuery({ prefix: "mv", filterKeys: FILTER_KEYS });
  const { filters } = query;

  // Only values the contract knows reach the request; a hand-edited URL with
  // `mv_state=bogus` would otherwise be a 422 on every load.
  const privacy = PRIVACIES.find((p) => p.value === filters.privacy)?.value;
  const state = STATES.find((s) => s.value === filters.state)?.value;
  const channelId = channels.find((c) => c.id === filters.channel)?.id;
  const q = filters.q ?? "";

  // The search box edits local text immediately and the URL once typing pauses.
  const [text, setText] = useState(q);
  const debouncedText = useDebouncedValue(text, 300);
  const setFilterRef = useRef(query.setFilter);
  useEffect(() => {
    setFilterRef.current = query.setFilter;
  });
  const appliedQ = useRef(q);
  useEffect(() => {
    appliedQ.current = q;
  }, [q]);
  useEffect(() => {
    const next = debouncedText.trim();
    if (next !== appliedQ.current) setFilterRef.current("q", next);
  }, [debouncedText]);

  const queryKey = JSON.stringify([q, privacy, state, channelId]);
  const list = useAppendingList<Video>({
    queryKey,
    getId: (v) => v.id,
    load: (window, signal) =>
      api
        .listMyVideos({ q: q || undefined, privacy, state, channel_id: channelId, ...window }, signal)
        .then((res) => ({ items: res.videos, total: res.total })),
  });
  const { status, items: videos } = list;

  // Replace-file availability, fetched once (same as the per-channel section).
  const [replaceEnabled, setReplaceEnabled] = useState(false);
  const [additionalExts, setAdditionalExts] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((res) => {
        setReplaceEnabled(res.features.video_replace === true);
        setAdditionalExts(res.features.upload_additional_extensions ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Selection is tagged with the query it was made under, so changing a filter
  // drops it without an effect: ids picked in one result set must not ride into
  // a bulk action on another.
  const [sel, setSel] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: queryKey,
    ids: NO_SELECTION,
  });
  const selected = sel.key === queryKey ? sel.ids : NO_SELECTION;
  const setSelected = (ids: ReadonlySet<string>) => setSel({ key: queryKey, ids });
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allSelected = videos.length > 0 && videos.every((v) => selected.has(v.id));

  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const titles = useMemo(() => new Map(videos.map((v) => [v.id, v.title])), [videos]);
  const chosen = videos.filter((v) => selected.has(v.id));

  async function runBulk(
    body: { action: "delete" } | { action: "set_privacy"; privacy: VideoPrivacy },
    verb: string,
  ) {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setSummary(null);
    const ids = chosen.map((v) => v.id);
    try {
      const res = await api.bulkMyVideos({ video_ids: ids, ...body });
      const failures = res.results
        .filter((r) => !r.ok)
        .map((r) => ({
          id: r.video_id,
          title: titles.get(r.video_id) ?? r.video_id,
          error: r.error ?? "Failed.",
        }));
      setSummary({
        kind: failures.length === 0 ? "success" : "warning",
        message:
          failures.length === 0
            ? `${verb} ${res.succeeded} ${res.succeeded === 1 ? "video" : "videos"}.`
            : `${verb} ${res.succeeded} of ${ids.length}. ${failures.length} failed:`,
        failures,
      });
      // Failed items stay selected so the creator can see and retry them.
      setSelected(new Set(failures.map((f) => f.id)));
      list.reload();
    } catch (err) {
      setSummary({
        kind: "danger",
        message: errorMessage(err, "Could not complete the bulk action. Nothing was changed."),
        failures: [],
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const filtered = q !== "" || privacy !== undefined || state !== undefined || channelId !== undefined;
  const clearFilters = () => {
    setText("");
    query.setFilters({ q: undefined, privacy: undefined, state: undefined, channel: undefined });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Your videos</h2>
        <Button variant="secondary" size="sm" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter your videos">
        <div className="relative">
          <Input
            label="Search"
            type="search"
            placeholder="Search titles"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
          />
          <SearchIcon size={16} className="pointer-events-none absolute bottom-3 right-3 text-fg-muted" />
        </div>
        <Select label="Privacy" value={privacy ?? ""} onChange={(e) => query.setFilter("privacy", e.target.value)}>
          <option value="">Any privacy</option>
          {PRIVACIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
        <Select label="State" value={state ?? ""} onChange={(e) => query.setFilter("state", e.target.value)}>
          <option value="">Any state</option>
          {STATES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        <Select label="Channel" value={channelId ?? ""} onChange={(e) => query.setFilter("channel", e.target.value)}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.display_name || c.handle}</option>
          ))}
        </Select>
      </div>

      {status === "ready" && videos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-muted px-4 py-2" role="toolbar" aria-label="Bulk actions">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-accent focus-ring"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? NO_SELECTION : new Set(videos.map((v) => v.id)))}
            />
            <span>Select all loaded</span>
          </label>
          <span className="text-sm text-fg-muted" aria-live="polite">
            {selected.size === 0
              ? list.total !== undefined
                ? `${list.total} ${list.total === 1 ? "video" : "videos"}`
                : ""
              : `${selected.size} selected`}
          </span>
          {selected.size > 0 ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Dropdown
                trigger="Change privacy"
                triggerLabel={`Change privacy of ${selected.size} selected`}
                align="end"
                items={BULK_PRIVACIES.map((p) => ({
                  label: p.label,
                  onSelect: () => void runBulk({ action: "set_privacy", privacy: p.value }, "Updated"),
                  disabled: busy,
                }))}
              />
              <Button variant="secondary" size="sm" onClick={() => setPlaylistOpen(true)} disabled={busy}>
                <PlaylistIcon size={16} /> Add to playlist
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <TrashIcon size={16} /> Delete
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {summary ? (
        <div className="flex flex-col gap-2">
          <Alert variant={summary.kind}>{summary.message}</Alert>
          {summary.failures.length > 0 ? (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm" aria-label="Videos that failed">
              {summary.failures.map((f) => (
                <li key={f.id} className="rounded-lg bg-danger-surface px-3 py-2 text-danger">
                  <span className="font-medium">{f.title}</span>: {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load your videos." onRetry={list.reload} />
      ) : videos.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<SearchIcon size={24} />}
            title="No videos match these filters"
            message="Try a different search, or clear the filters."
          />
        ) : (
          <EmptyState icon={<VideoIcon size={24} />} title="No videos yet" message="Upload a video to see it here." />
        )
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              config={config}
              channels={channels}
              replaceEnabled={replaceEnabled}
              replaceAccept={videoAcceptAttr(additionalExts)}
              leading={
                <input
                  type="checkbox"
                  aria-label={`Select ${v.title}`}
                  className="h-4 w-4 shrink-0 rounded border-border accent-accent focus-ring"
                  checked={selected.has(v.id)}
                  onChange={() => toggle(v.id)}
                />
              }
              onUpdated={(u) => list.patch((rows) => rows.map((x) => (x.id === u.id ? u : x)))}
              onDeleted={() => list.drop((x) => x.id !== v.id)}
            />
          ))}
        </ul>
      )}
      {filtered && status !== "loading" ? (
        <div>
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}
      {status === "ready" ? (
        <ListTail
          hasMore={list.hasMore}
          autoLoad={autoLoad}
          busy={list.moreStatus === "loading"}
          error={list.moreStatus === "error" ? "Could not load more videos." : null}
          onLoadMore={list.loadMore}
        />
      ) : null}

      {confirmDelete ? (
        <Modal title={`Delete ${chosen.length} ${chosen.length === 1 ? "video" : "videos"}?`} onClose={() => setConfirmDelete(false)}>
          <p className="mb-4 text-sm text-fg-muted">
            This permanently deletes {chosen.length} {chosen.length === 1 ? "video" : "videos"} and cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void runBulk({ action: "delete" }, "Deleted")} disabled={busy}>
              {busy ? "Deleting..." : `Delete ${chosen.length}`}
            </Button>
          </div>
        </Modal>
      ) : null}

      {playlistOpen ? (
        <BulkAddToPlaylistDialog
          videos={chosen.map((v) => ({ id: v.id, title: v.title }))}
          onClose={() => setPlaylistOpen(false)}
        />
      ) : null}
    </section>
  );
}
