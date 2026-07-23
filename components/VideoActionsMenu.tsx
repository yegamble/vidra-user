"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { DownloadDialog } from "@/components/DownloadButton";
import {
  CaptionsIcon,
  ClockIcon,
  DownloadIcon,
  FlagIcon,
  MoreVerticalIcon,
  PlaylistIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  SlashCircleIcon,
  TrashIcon,
  VideoIcon,
} from "@/components/icons";
import { PlaylistPickerDialog } from "@/components/PlaylistPickerDialog";
import { ReportDialog } from "@/components/ReportButton";
import { ShareDialog } from "@/components/ShareButton";
import { Button, Dropdown, Modal, useToast, type DropdownItem } from "@/components/ui";
import { api, errorMessage, type Video } from "@/lib/api";
import { enqueueVideo } from "@/lib/video-queue";
import { useVideoActionPermissions } from "@/lib/use-video-action-permissions";

type Dialog = "playlist" | "download" | "share" | "delete" | "report" | null;

function ActionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-3 py-0.5">
      <span aria-hidden className="flex w-5 shrink-0 justify-center text-fg-muted">
        {icon}
      </span>
      <span>{children}</span>
    </span>
  );
}

/** Overflow actions shared by local and federated video thumbnail cards. */
export function VideoActionsMenu({
  video,
  onDeleted,
  compact = false,
}: {
  video: Video;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const permissions = useVideoActionPermissions(video);
  const [dialog, setDialog] = useState<Dialog>(null);

  const runPrivilegedAction = (success: string, operation: () => Promise<unknown>) => {
    void operation()
      .then(() => toast({ message: success, variant: "success" }))
      .catch((err: unknown) =>
        toast({ message: errorMessage(err, "The operation could not be started."), variant: "error" }),
      );
  };

  const local = video.remote !== true;
  const items: DropdownItem[] = [
    {
      label: <ActionLabel icon={<PlusIcon size={18} />}>Add to queue</ActionLabel>,
      onSelect: () => {
        const added = enqueueVideo(video);
        toast({
          message: added ? `“${video.title}” added to the queue.` : `“${video.title}” is already queued.`,
          variant: added ? "success" : "info",
        });
      },
    },
  ];

  if (local) {
    items.push(
      {
        label: <ActionLabel icon={<ClockIcon size={18} />}>Watch later</ActionLabel>,
        onSelect: () => {
          if (!permissions.signedIn) {
            router.push("/login");
            return;
          }
          void api
            .saveVideo(video.id)
            .then(() => toast({ message: `“${video.title}” saved to Watch later.`, variant: "success" }))
            .catch((err: unknown) =>
              toast({ message: errorMessage(err, "Could not save this video."), variant: "error" }),
            );
        },
      },
      {
        label: <ActionLabel icon={<PlaylistIcon size={18} />}>Save to playlist</ActionLabel>,
        onSelect: () => {
          if (!permissions.signedIn) router.push("/login");
          else setDialog("playlist");
        },
      },
    );
    if (permissions.canDownload) {
      items.push({
        label: <ActionLabel icon={<DownloadIcon size={18} />}>Download</ActionLabel>,
        onSelect: () => setDialog("download"),
      });
    }
  }

  items.push({
    label: <ActionLabel icon={<ShareIcon size={18} />}>Share</ActionLabel>,
    onSelect: () => setDialog("share"),
  });

  if (permissions.canManage) {
    items.push({
      label: <ActionLabel icon={<VideoIcon size={18} />}>Manage</ActionLabel>,
      onSelect: () => router.push(`/studio?video=${encodeURIComponent(video.id)}`),
    });

    if (permissions.privileged) {
      items.push({
        label: <ActionLabel icon={<SlashCircleIcon size={18} />}>Block</ActionLabel>,
        onSelect: () =>
          runPrivilegedAction("Video blocked.", () => api.blockVideo(video.id)),
      });
    }

    items.push({
      label: <ActionLabel icon={<TrashIcon size={18} />}>Delete</ActionLabel>,
      onSelect: () => setDialog("delete"),
      danger: true,
    });

    if (permissions.privileged) {
      items.push(
        {
          label: <ActionLabel icon={<SettingsIcon size={18} />}>Run HLS transcoding</ActionLabel>,
          onSelect: () =>
            runPrivilegedAction("HLS transcoding queued.", () =>
              api.runVideoTranscoding(video.id, "hls"),
            ),
        },
        {
          label: <ActionLabel icon={<SettingsIcon size={18} />}>Run Web Video transcoding</ActionLabel>,
          onSelect: () =>
            runPrivilegedAction("Web Video transcoding queued.", () =>
              api.runVideoTranscoding(video.id, "web_video"),
            ),
        },
        {
          label: <ActionLabel icon={<CaptionsIcon size={18} />}>Generate caption</ActionLabel>,
          onSelect: () =>
            runPrivilegedAction("Caption generation queued.", () =>
              api.requestAutoCaption(video.id),
            ),
        },
      );
    }
  }

  items.push({
    label: <ActionLabel icon={<FlagIcon size={18} />}>Report</ActionLabel>,
    onSelect: () => {
      if (!permissions.signedIn) router.push("/login");
      else setDialog("report");
    },
  });

  return (
    <>
      <Dropdown
        trigger={<MoreVerticalIcon size={compact ? 24 : 26} />}
        triggerLabel={`Actions for ${video.title}`}
        items={items}
        align="end"
        triggerVariant="icon"
        // ≥44px touch target on the standard card (design-system.md:44), a
        // deliberate 40px dense-list exception when compact (matches YouTube).
        // Sizing lives here alone; the icon variant sets no padding to fight it.
        triggerClassName={compact ? "h-10 w-10" : "h-11 w-11"}
      />

      {dialog === "playlist" ? (
        <PlaylistPickerDialog videoId={video.id} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "download" ? (
        <DownloadDialog videoId={video.id} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "share" ? (
        <ShareDialog
          videoId={video.id}
          title={video.title}
          atSeconds={0}
          watchPath={video.remote === true ? `/remote/${video.id}` : undefined}
          allowEmbed={video.remote !== true}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "delete" ? (
        <DeleteVideoDialog
          video={video}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null);
            onDeleted?.();
          }}
        />
      ) : null}
      {dialog === "report" ? (
        <ReportDialog
          kind={video.remote === true ? "remote_video" : "video"}
          targetId={video.id}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function DeleteVideoDialog({
  video,
  onClose,
  onDeleted,
}: {
  video: Video;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteVideo(video.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "Could not delete this video."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Delete video?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-fg-muted">
          “{video.title}” and its stored media will be permanently deleted. This cannot be undone.
        </p>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
