"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/components/I18nProvider";
import { ChevronDownIcon, PlaylistIcon, RepeatIcon, ShuffleIcon } from "@/components/icons";
import { ListTail } from "@/components/ui/ListTail";
import { videoThumbnailUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { usePlaylistNext } from "@/lib/use-playlist-next";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";
import { useSettledSession } from "@/lib/use-settled-session";

type Queue = ReturnType<typeof usePlaylistNext>;

// PlaylistPanel is the watch page's playlist mode panel (PeerTube/YouTube
// parity): title, "n / total", loop + shuffle toggles, and the items — paged by
// the shared appending seam as the list scrolls — with the playing one marked
// and scrolled into view. It sits under the player; below `md` the item list is
// a collapsible sheet (collapsed by default), from `md` up it is always open.
export function PlaylistPanel({ queue, videoId }: { queue: Queue; videoId: string }) {
  const { list, meta, pos, total, loop, shuffle } = queue;
  const t = useT();
  const { viewerId } = useSettledSession();
  const autoLoad = useBrowseAutoLoad();
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLLIElement>(null);

  // Centre the playing row inside the list (not the page — scrollIntoView would
  // drag the whole watch page with it).
  useEffect(() => {
    const box = scroller.current;
    const row = current.current;
    if (box && row) box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
  }, [videoId, list.items.length, open]);

  return (
    <section aria-label={t("panels.playlist.label")} data-testid="playlist-panel" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded text-left md:pointer-events-none"
        >
          <PlaylistIcon size={18} className="shrink-0 text-fg-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold">{meta?.title ?? t("panels.playlist.label")}</span>
            <span className="block truncate text-xs tabular-nums text-fg-muted">
              {[viewerId && meta?.owner_id === viewerId ? t("panels.playlist.yours") : null, meta?.visibility, pos >= 0 && total ? t("panels.playlist.position", { current: pos + 1, total }) : total ? t("panels.playlist.videos", { total }) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <ChevronDownIcon size={18} className={cn("shrink-0 transition-transform md:hidden", open ? "rotate-180" : null)} />
        </button>
        <Toggle label={t("panels.playlist.loop")} on={loop} onClick={() => queue.setLoop(!loop)} icon={<RepeatIcon size={18} />} />
        <Toggle label={t("panels.playlist.shuffle")} on={shuffle} onClick={() => queue.setShuffle(!shuffle)} icon={<ShuffleIcon size={18} />} />
      </div>
      <div className={cn("border-t border-border-subtle", open ? "block" : "hidden md:block")}>
        <div ref={scroller} className="relative max-h-[360px] overflow-y-auto">
        <ul className="flex flex-col">
          {list.items.map((v, i) => {
            const isCurrent = v.id === videoId;
            return (
              <li key={v.id} ref={isCurrent ? current : undefined} className={cn(isCurrent ? "bg-surface-muted" : null)}>
                <Link
                  href={queue.itemHref(v, i)}
                  aria-current={isCurrent ? "true" : undefined}
                  className="focus-ring flex items-center gap-3 px-3 py-2 hover:bg-surface-muted"
                >
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-fg-muted">{i + 1}</span>
                  {v.has_thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={videoThumbnailUrl(v.id)} alt="" loading="lazy" className="aspect-video w-24 shrink-0 rounded-md object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{v.title}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {v.channel_display_name || v.channel_handle}
                      {v.duration_seconds ? ` · ${formatDuration(v.duration_seconds)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
          <ListTail
            hasMore={list.hasMore}
            autoLoad={autoLoad}
            busy={list.moreStatus === "loading"}
            error={list.moreStatus === "error" ? t("panels.playlist.moreError") : null}
            onLoadMore={list.loadMore}
          />
        </div>
      </div>
    </section>
  );
}

function Toggle({ label, on, onClick, icon }: { label: string; on: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
        on ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-surface-strong hover:text-fg",
      )}
    >
      {icon}
    </button>
  );
}
