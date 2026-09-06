"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";
import { SignInGate } from "@/components/SignInGate";

// Human copy for the known notification types (the backend's switchboard keys).
// A type the backend returns that is not listed here still renders (by its raw
// key) so a new backend type is never silently untogglable. Exported so the
// notifications test can prove every shipped type has a label.
export const TYPE_LABELS: Record<string, { label: string; help: string }> = {
  comment: {
    label: "Comments",
    help: "Someone comments on one of your videos.",
  },
  comment_reply: {
    label: "Replies",
    help: "Someone replies to a comment you wrote (on any video).",
  },
  follow: {
    label: "New followers",
    help: "Someone starts following one of your channels.",
  },
  message: {
    label: "Direct messages",
    help: "Someone sends you a direct message.",
  },
  new_video: {
    label: "New videos",
    help: "A channel you follow publishes a new video (per-channel bells apply).",
  },
  new_report: {
    label: "New abuse reports",
    help: "A user files an abuse report (delivered to admins and moderators only).",
  },
  report_resolved: {
    label: "Report outcomes",
    help: "A moderator resolves an abuse report you filed.",
  },
  video_rejected: {
    label: "Rejected uploads",
    help: "A moderator rejects one of your held uploads.",
  },
  video_blocked: {
    label: "Blocked videos",
    help: "A moderator blocks one of your published videos, hiding it from viewers.",
  },
  caption_ready: {
    label: "Captions ready",
    help: "Auto-captions finish for one of your videos.",
  },
};

// A stable display order for the known types; unknown-but-returned types sort
// after them, alphabetically.
const TYPE_ORDER = [
  "comment",
  "comment_reply",
  "follow",
  "new_video",
  "message",
  "new_report",
  "report_resolved",
  "video_rejected",
  "video_blocked",
  "caption_ready",
];

function orderedTypes(prefs: Record<string, boolean>): string[] {
  return Object.keys(prefs).sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a);
    const ib = TYPE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

// NotificationPrefsView is the per-type notification switchboard
// (/settings/notifications): every known type mapped to whether it is
// delivered. Toggles PATCH immediately (optimistic, one type per request) and
// re-sync from the server's full response; a failed PATCH reverts the switch
// and says so. Session-gated like the other settings surfaces.
export function NotificationPrefsView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <SignInGate title="Sign in to manage notifications" restoringLabel="Loading your account">
        to choose which notifications you receive.
      </SignInGate>
    );
  }

  return <Prefs />;
}

function Prefs() {
  const {
    status,
    data,
    retry,
    setData: setPrefs,
  } = useApiResource<Record<string, boolean>>((signal) =>
    api.getNotificationPrefs(signal).then((res) => res.prefs),
  );
  const prefs = data ?? {};
  const [error, setError] = useState<string | null>(null);

  async function toggle(type: string) {
    const next = !prefs[type];
    setError(null);
    setPrefs((p) => ({ ...p, [type]: next })); // optimistic
    try {
      const res = await api.updateNotificationPrefs({ [type]: next });
      setPrefs(res.prefs); // the server's full map is the source of truth
    } catch (err) {
      setPrefs((p) => ({ ...p, [type]: !next })); // revert
      setError(errorMessage(err, "Could not save that preference. Please try again."));
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading notification preferences" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load your notification preferences."
        onRetry={retry}
      />
    );
  }

  const types = orderedTypes(prefs);
  if (types.length === 0) {
    return (
      <EmptyState
        title="No notification types"
        message="This instance exposes no configurable notification types."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert>
          {error}
        </Alert>
      ) : null}
      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        {types.map((type) => {
          const meta = TYPE_LABELS[type];
          const enabled = prefs[type];
          return (
            <li key={type} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {meta?.label ?? type}
                </p>
                {meta ? (
                  <p className="text-xs text-fg-muted">{meta.help}</p>
                ) : null}
              </div>
              <Toggle
                checked={enabled}
                onChange={() => void toggle(type)}
                label={`${meta?.label ?? type} notifications`}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted">
        Turning a type off stops new notifications of that kind; ones you already have stay in
        your list.
      </p>
    </div>
  );
}
