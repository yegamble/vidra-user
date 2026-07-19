"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/api";

type Status = "loading" | "error" | "ready";

// Human copy for the known notification types (the backend's switchboard keys).
// A type the backend returns that is not listed here still renders (by its raw
// key) so a new backend type is never silently untogglable.
const TYPE_LABELS: Record<string, { label: string; help: string }> = {
  comment: {
    label: "Comments",
    help: "Someone comments on one of your videos.",
  },
  follow: {
    label: "New followers",
    help: "Someone starts following one of your channels.",
  },
  message: {
    label: "Direct messages",
    help: "Someone sends you a direct message.",
  },
  report_resolved: {
    label: "Report outcomes",
    help: "A moderator resolves an abuse report you filed.",
  },
  video_rejected: {
    label: "Rejected uploads",
    help: "A moderator rejects one of your held uploads.",
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
  "follow",
  "message",
  "report_resolved",
  "video_rejected",
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

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }
  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to manage notifications"
        message={
          <>
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
              Sign in
            </Link>{" "}
            to choose which notifications you receive.
          </>
        }
      />
    );
  }

  return <Prefs />;
}

function Prefs() {
  const [status, setStatus] = useState<Status>("loading");
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getNotificationPrefs(controller.signal)
      .then((res) => {
        setPrefs(res.prefs);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

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
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
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
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
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
