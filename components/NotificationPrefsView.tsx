"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/api";
import { useInstanceFeatures } from "@/lib/instance-features";
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
  comment_held: {
    label: "Comments awaiting approval",
    help: "A comment on a video you manage needs your approval before it appears.",
  },
  comment_mention: {
    label: "Mentions",
    help: "Someone @-mentions you in a comment.",
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
  new_registration_request: {
    label: "New registration requests",
    help: "Someone requests an account while sign-ups need approval (admins and moderators only).",
  },
  upload_quarantined: {
    label: "Uploads awaiting review",
    help: "An upload enters the quarantine queue (admins and moderators only).",
  },
  federation_follower_request: {
    label: "Remote follower requests",
    help: "A remote account asks to follow a channel while follower approval is on (admins only).",
  },
  report_resolved: {
    label: "Report outcomes",
    help: "A moderator resolves an abuse report you filed.",
  },
  report_message: {
    label: "Report messages",
    help: "A new message about an abuse report — from a moderator on yours, or from a reporter (staff).",
  },
  video_rejected: {
    label: "Rejected uploads",
    help: "A moderator rejects one of your held uploads.",
  },
  video_blocked: {
    label: "Blocked videos",
    help: "A moderator blocks one of your published videos, hiding it from viewers.",
  },
  video_unblocked: {
    label: "Restored videos",
    help: "A moderator lifts a block, so one of your videos is available again.",
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
  "comment_mention",
  "follow",
  "new_video",
  "message",
  "new_report",
  "new_registration_request",
  "upload_quarantined",
  "federation_follower_request",
  "report_resolved",
  "report_message",
  "video_rejected",
  "video_blocked",
  "video_unblocked",
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
// delivered in the app, and — for the types the server can email (its `email`
// map) — whether it is also emailed. Switches PATCH immediately (optimistic,
// one switch per request) and re-sync from the server's full response; a
// failed PATCH reverts the switch and says so. Session-gated like the other
// settings surfaces.
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

type Switchboard = { prefs: Record<string, boolean>; email: Record<string, boolean> };
type Channel = keyof Switchboard;

function fromServer(res: { prefs: Record<string, boolean>; email?: Record<string, boolean> }): Switchboard {
  // An older backend sends no email map: no email column, rather than a crash.
  return { prefs: res.prefs, email: res.email ?? {} };
}

function Prefs() {
  const { user } = useSession();
  // features.mail is the instance's live "has an outbound mail path" gate.
  const mailOff = useInstanceFeatures()?.mail === false;
  const { status, data, retry, setData } = useApiResource<Switchboard>((signal) =>
    api.getNotificationPrefs(signal).then(fromServer),
  );
  const prefs = data?.prefs ?? {};
  const email = data?.email ?? {};
  const [error, setError] = useState<string | null>(null);

  async function toggle(channel: Channel, type: string) {
    const next = !(channel === "prefs" ? prefs : email)[type];
    const set = (value: boolean) =>
      setData((d) => (d ? { ...d, [channel]: { ...d[channel], [type]: value } } : d));
    setError(null);
    set(next); // optimistic
    try {
      const res =
        channel === "prefs"
          ? await api.updateNotificationPrefs({ [type]: next })
          : await api.updateNotificationEmailPrefs({ [type]: next });
      setData(fromServer(res)); // the server's full maps are the source of truth
    } catch (err) {
      set(!next); // revert
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
  // With no outbound mail nothing is ever emailed, so offering the switches
  // would be a dead control; the server still keeps the stored choices.
  const offersEmail = Object.keys(email).length > 0;
  const hasEmail = offersEmail && !mailOff;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert>
          {error}
        </Alert>
      ) : null}
      {hasEmail && user && !user.email_verified ? (
        // A hint, not a failure: Alert's tones are all assertive.
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-fg">
          Notification emails go only to a verified email address.{" "}
          <Link href="/settings" className="font-medium text-accent-text underline">
            Verify your address
          </Link>{" "}
          to receive them.
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        {hasEmail ? (
          <li aria-hidden="true" className="flex justify-end gap-3 px-4 py-2 text-xs font-medium text-fg-muted">
            <span className="w-[46px] text-center">App</span>
            <span className="w-[46px] text-center">Email</span>
          </li>
        ) : null}
        {types.map((type) => {
          const meta = TYPE_LABELS[type];
          const label = meta?.label ?? type;
          const emailable = hasEmail && type in email;
          return (
            <li key={type} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{label}</p>
                {meta ? (
                  <p className="text-xs text-fg-muted">{meta.help}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Toggle
                  checked={prefs[type]}
                  onChange={() => void toggle("prefs", type)}
                  label={`${label} notifications`}
                />
                {emailable ? (
                  <Toggle
                    checked={email[type]}
                    // Email rides the in-app notification: with that off, none is sent.
                    disabled={!prefs[type]}
                    onChange={() => void toggle("email", type)}
                    label={`${label} email notifications`}
                  />
                ) : hasEmail ? (
                  <span aria-hidden="true" className="w-[46px]" />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted">
        Turning a type off stops new notifications of that kind; ones you already have stay in
        your list.
        {hasEmail
          ? " Email is off until you turn it on, and is sent only while the in-app notification is on."
          : null}
        {offersEmail && mailOff
          ? " This instance isn't set up to send email, so notifications are in-app only."
          : null}
      </p>
    </div>
  );
}
