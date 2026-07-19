"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { Channel, ChannelMember } from "@/lib/api";

import { ROW_ACTION, type Status } from "./shared";

// CollaboratorsCard — the Studio Channel-tab surface for editor collaborators.
// Owners (`canManage`) can invite a local user by handle (role Editor), see the
// member list, and remove members (with an inline confirm). Editors viewing a
// channel shared with them see the same list read-only (the members endpoint is
// visible to the owner and existing members). PeerTube only shipped this in v8;
// we model it first-class.
export function CollaboratorsCard({
  channel,
  canManage = false,
}: {
  channel: Channel;
  canManage?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listChannelMembers(channel.handle, controller.signal)
      .then((res) => {
        setMembers(res.members);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [channel.handle, reloadKey]);

  return (
    <section aria-labelledby="collaborators-heading" className="flex flex-col gap-3">
      <h2 id="collaborators-heading" className="text-[15px] font-bold tracking-tight">
        Collaborators
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-4">
        <p className="text-[13px] text-fg-muted">
          Editors can upload, edit, and manage this channel&rsquo;s videos and live streams. Only you
          can change channel settings, distribution, and membership.
        </p>

        {canManage ? <InviteForm channel={channel} onAdded={(m) => setMembers((list) => [...list, m])} /> : null}

        {status === "loading" ? (
          <div className="flex justify-center py-6">
            <Spinner label="Loading collaborators" />
          </div>
        ) : status === "error" ? (
          <ErrorState
            message="Could not load collaborators."
            onRetry={() => {
              setStatus("loading");
              setReloadKey((k) => k + 1);
            }}
          />
        ) : members.length === 0 ? (
          <p className="text-sm text-fg-muted">No collaborators yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface-muted">
            {members.map((member) => (
              <MemberRow
                key={member.user_id}
                channel={channel}
                member={member}
                canManage={canManage}
                onRemoved={() =>
                  setMembers((list) => list.filter((m) => m.user_id !== member.user_id))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// InviteForm — invite a local user by handle as an editor. Surfaces the backend's
// 404 (no such user) and 409 (already manages the channel) inline.
function InviteForm({ channel, onAdded }: { channel: Channel; onAdded: (m: ChannelMember) => void }) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const target = handle.trim();
    if (busy || target === "") return;
    setBusy(true);
    setError(null);
    try {
      const member = await api.addChannelMember(channel.handle, { handle: target, role: "editor" });
      onAdded(member);
      setHandle("");
    } catch (err) {
      setError(
        errorMessage(err, "Could not add the collaborator.", {
          "404": "No such user.",
          "409": "That user already manages this channel.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void invite(e)} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Invite an editor"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="username"
            aria-label="Collaborator handle"
            maxLength={30}
          />
        </div>
        <Button type="submit" disabled={busy || handle.trim() === ""}>
          Add editor
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

// MemberRow — one collaborator, with a confirm-gated remove for owners.
function MemberRow({
  channel,
  member,
  canManage,
  onRemoved,
}: {
  channel: Channel;
  member: ChannelMember;
  canManage: boolean;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.removeChannelMember(channel.handle, member.user_id);
      onRemoved();
    } catch (err) {
      setError(errorMessage(err, "Could not remove this collaborator."));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">
          {member.display_name}
          <span className="ml-1 font-normal text-fg-muted">@{member.username}</span>
        </p>
        <p className="text-[12.5px] capitalize text-fg-muted">{member.role}</p>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
      {canManage ? (
        confirming ? (
          <div className="flex shrink-0 items-center gap-1 text-sm">
            <span className="text-[13px] text-fg-muted">Remove?</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className={`${ROW_ACTION} text-danger hover:bg-danger-surface`}
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className={`${ROW_ACTION} text-fg-muted hover:bg-surface-strong hover:text-fg`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <Button
            variant="danger-outline"
            size="sm"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${member.username}`}
          >
            Remove
          </Button>
        )
      ) : null}
    </li>
  );
}
