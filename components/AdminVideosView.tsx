"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AdminSearch } from "@/components/admin/AdminControls";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import {
  api,
  errorMessage,
  remoteVideoThumbnailUrl,
  videoThumbnailUrl,
  type AdminVideo,
} from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";

type Status = "loading" | "error" | "ready";

export function AdminVideosView() {
  return (
    <RoleGate minRole="moderator" action="manage videos">
      <VideosList />
    </RoleGate>
  );
}

function VideosList() {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getAdminVideos({ q: query || undefined, limit: 100 }, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [query, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);
  const submitSearch = useCallback((next: string) => {
    setStatus("loading");
    setQuery(next);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold tabular-nums text-fg-muted">
          {status === "ready" ? `${videos.length} videos` : "Videos"}
        </p>
        <div className="w-full sm:w-[28rem]">
          <AdminSearch
            label="Search videos by title"
            placeholder="Search videos"
            value={input}
            onChange={setInput}
            onSubmit={() => submitSearch(input.trim())}
            onClear={() => {
              setInput("");
              submitSearch("");
            }}
            hasQuery={Boolean(query)}
          />
        </div>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-24"><Spinner label="Loading videos" /></div>
      ) : status === "error" ? (
        <ErrorState message="Could not load videos." onRetry={retry} />
      ) : videos.length === 0 ? (
        <EmptyState
          title={query ? "No matching videos" : "No videos yet"}
          message={query ? "Try a different search term." : "Videos will appear here as they are published."}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className="border-b border-border-subtle text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-muted">
              <tr>
                <th className="px-4 py-3" scope="col">Video</th>
                <th className="px-4 py-3" scope="col">Info</th>
                <th className="px-4 py-3" scope="col">Files</th>
                <th className="px-4 py-3" scope="col">Published</th>
                <th className="px-4 py-3 text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {videos.map((video) => (
                <VideoRow
                  key={`${video.is_local ? "local" : "remote"}-${video.id}`}
                  video={video}
                  onChanged={(next) => setVideos((all) => all.map((v) => v.id === next.id && v.is_local === next.is_local ? next : v))}
                  onRemoved={() => setVideos((all) => all.filter((v) => v.id !== video.id || v.is_local !== video.is_local))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const PILL = "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em]";

function VideoRow({ video, onChanged, onRemoved }: {
  video: AdminVideo;
  onChanged: (video: AdminVideo) => void;
  onRemoved: () => void;
}) {
  const href = video.is_local ? `/videos/${video.id}` : `/remote/${video.id}`;
  const thumbnail = video.is_local ? videoThumbnailUrl(video.id) : remoteVideoThumbnailUrl(video.id);

  return (
    <tr className="align-middle">
      <td className="px-4 py-3">
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
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-[19rem] flex-wrap gap-1.5">
          <Pill className={video.is_local ? "bg-accent/15 text-accent" : "bg-surface-strong text-fg-muted"}>
            {video.is_local ? "Local" : "Federated"}
          </Pill>
          <Pill className={video.privacy === "public" ? "bg-success/15 text-success" : "bg-surface-strong text-fg-muted"}>
            {video.privacy}
          </Pill>
          {video.sensitive ? <Pill className="bg-danger/15 text-danger">Sensitive</Pill> : null}
          {video.external_link ? <Pill className="bg-surface-strong text-fg-muted">External link</Pill> : null}
          {video.state !== "published" ? <Pill className="bg-warning/15 text-warning">{video.state}</Pill> : null}
          {video.blocked ? <Pill className="bg-danger/15 text-danger">Blocked</Pill> : null}
          {!video.is_local && video.origin_domain ? (
            <span className="w-full truncate pt-1 text-xs text-fg-muted" title={video.origin_domain}>{video.origin_domain}</span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        {video.is_local ? (
          <div className="flex max-w-[22rem] flex-wrap items-center gap-1.5">
            {video.has_original ? <Pill className="bg-accent/15 text-accent">Original</Pill> : null}
            {video.hls_count > 0 ? <Pill className="bg-accent/15 text-accent">HLS ({video.hls_count})</Pill> : null}
            {video.web_video_count > 0 ? <Pill className="bg-accent/15 text-accent">Web Videos ({video.web_video_count})</Pill> : null}
            {video.object_storage ? <Pill className="bg-accent/15 text-accent">Object storage</Pill> : null}
            <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-fg-muted">{formatBytes(video.size_bytes)}</span>
          </div>
        ) : <span className="text-xs text-fg-muted">Hosted by origin</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-fg-muted">
        {formatDateTime(video.published_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <ModerationActions video={video} onChanged={onChanged} onRemoved={onRemoved} />
      </td>
    </tr>
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
      trigger={<MoreHorizontalIcon size={20} />}
      triggerLabel={`Actions for ${video.title}`}
      items={items}
      align="end"
      triggerClassName="h-10 w-10 justify-center px-0"
    />
  );
}
