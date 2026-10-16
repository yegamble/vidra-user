"use client";

import Link from "next/link";
import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { ChannelSyncSection } from "@/components/ChannelSyncSection";
import { ProfileImageManager } from "@/components/ProfileImageManager";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { VideoIcon } from "@/components/icons";
import {
  api,
  channelAvatarUrl,
  channelBannerUrl,
  errorMessage,
} from "@/lib/api";
import type { Channel } from "@/lib/api";
import { invalidateVideoActionPermissionCache } from "@/lib/use-video-action-permissions";

import { ROW_ACTION } from "./shared";
import { ChannelProtocolBadges } from "./ChannelProtocolBadges";
import { CollaboratorsCard } from "./CollaboratorsCard";
import { DistributionCard } from "./DistributionCard";
import { SupportTextField } from "./SupportTextField";
import { useStudio } from "./StudioContext";

// CreateChannelForm — the shared handle + display-name create form used both for
// the zero-channel onboarding state and inside the "Create another channel"
// dialog. On success it hands the created channel up (the caller adds it to the
// studio context and closes any dialog).
function CreateChannelForm({
  onCreated,
  autoFocus = false,
}: {
  onCreated: (ch: Channel) => void;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || handle.trim() === "" || displayName.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const ch = await api.createChannel({
        handle: handle.trim(),
        display_name: displayName.trim(),
      });
      invalidateVideoActionPermissionCache();
      onCreated(ch);
      setHandle("");
      setDisplayName("");
    } catch (err) {
      setError(
        errorMessage(err, t("studio.channel.createError"), {
          "409": t("studio.channel.handleTaken"),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void create(e)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-48">
          <Input
            label={t("studio.channel.handle")}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="ada_makes"
            aria-label={t("studio.channel.handleAria")}
            autoFocus={autoFocus}
            minLength={3}
            maxLength={30}
          />
        </div>
        <div className="flex-1">
          <Input
            label={t("studio.channel.displayName")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ada Makes"
            aria-label={t("studio.channel.displayNameAria")}
            maxLength={50}
          />
        </div>
        <Button type="submit" disabled={busy || handle.trim() === "" || displayName.trim() === ""}>
          {t("studio.channel.create")}
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

// CurrentChannelPanel routes the studio's CURRENT channel to the owner or editor
// view based on the caller's role (owners manage everything; editors get a
// read-only channel surface but keep full content access elsewhere).
function CurrentChannelPanel({ channel }: { channel: Channel }) {
  // `role` is set on GET /me/channels; an editor manages content but not the
  // channel itself. Absent role → treat as owner (owned channels always carry it).
  const isOwner = channel.role !== "editor";
  if (!isOwner) return <EditorChannelPanel channel={channel} />;
  return <OwnerChannelPanel channel={channel} />;
}

// EditorChannelPanel — the Channel tab for a channel shared WITH the caller as an
// editor: a read-only identity, the distribution status as read-only badges, and
// the collaborator list (read-only). No channel edit form, avatar/banner
// managers, sync section, distribution toggles, or danger zone — those are
// owner-only. The editor still has full Content/Live/Analytics/Dashboard access.
function EditorChannelPanel({ channel }: { channel: Channel }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="channel-details-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="channel-details-heading" className="text-[15px] font-bold tracking-tight">
            {t("studio.channel.details")}
          </h2>
          <Link
            href={`/channels/${channel.handle}`}
            className="focus-ring rounded-full text-[13px] font-semibold text-accent-text hover:underline"
          >
            {t("studio.channel.viewPublic")}
          </Link>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-fg">{channel.display_name}</p>
            <ChannelProtocolBadges channel={channel} />
          </div>
          <p className="text-[13px] text-fg-muted">@{channel.handle}</p>
          {channel.description ? (
            <p className="whitespace-pre-line text-sm text-fg">{channel.description}</p>
          ) : null}
          <p className="text-[12.5px] text-fg-muted">
            {t("studio.channel.editorNote")}
          </p>
        </div>
      </section>

      <DistributionCard channel={channel} />

      <CollaboratorsCard channel={channel} />
    </div>
  );
}

// OwnerChannelPanel manages the studio's CURRENT channel: edit its display name
// + description (PATCH), avatar/banner, distribution, collaborators, and delete it
// (which cascades to its videos). The server result is the source of truth (fed
// back into the studio context).
function OwnerChannelPanel({ channel }: { channel: Channel }) {
  const t = useT();
  const { updateChannel, removeChannel } = useStudio();
  const [displayName, setDisplayName] = useState(channel.display_name);
  const [description, setDescription] = useState(channel.description);
  const [support, setSupport] = useState(channel.support ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The parent remounts this panel (key={channel.id}) on a channel switch, so
  // the field state above always seeds from the current channel — no effect.

  async function save() {
    if (displayName.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateChannel(channel.handle, {
        display_name: displayName.trim(),
        description: description.trim(),
        support: support.trim(),
      });
      updateChannel(updated);
    } catch (err) {
      setError(errorMessage(err, t("studio.channel.saveError")));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteChannel(channel.handle);
      invalidateVideoActionPermissionCache();
      removeChannel(channel.id);
    } catch (err) {
      setError(errorMessage(err, t("studio.channel.deleteError")));
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="channel-details-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="channel-details-heading" className="text-[15px] font-bold tracking-tight">
            {t("studio.channel.details")}
          </h2>
          <Link
            href={`/channels/${channel.handle}`}
            className="focus-ring rounded-full text-[13px] font-semibold text-accent-text hover:underline"
          >
            {t("studio.channel.viewPublic")}
          </Link>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-4">
          <Input
            label={t("studio.channel.displayName")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label={t("studio.channel.editNameAria")}
            maxLength={50}
          />
          <Textarea
            label={t("studio.channel.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label={t("studio.channel.editDescriptionAria")}
            rows={3}
            maxLength={1000}
            className="resize-y"
          />
          <SupportTextField
            value={support}
            onChange={setSupport}
            ariaLabel={t("studio.channel.editSupportAria")}
          />
          <p className="text-[13px] text-fg-muted">@{channel.handle}</p>
          <ProfileImageManager
            kind="avatar"
            label={t("studio.channel.avatar")}
            name={channel.display_name || channel.handle}
            has={channel.has_avatar ?? false}
            src={channelAvatarUrl(channel.handle)}
            upload={(file) => api.setChannelAvatar(channel.handle, file)}
            remove={() => api.deleteChannelAvatar(channel.handle)}
            onChanged={(has) => updateChannel({ ...channel, has_avatar: has })}
          />
          <ProfileImageManager
            kind="banner"
            label={t("studio.channel.banner")}
            name={channel.display_name || channel.handle}
            has={channel.has_banner ?? false}
            src={channelBannerUrl(channel.handle)}
            upload={(file) => api.setChannelBanner(channel.handle, file)}
            remove={() => api.deleteChannelBanner(channel.handle)}
            onChanged={(has) => updateChannel({ ...channel, has_banner: has })}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div>
            <Button
              size="sm"
              disabled={busy || displayName.trim() === ""}
              onClick={() => void save()}
            >
              {t("studio.channel.save")}
            </Button>
          </div>
        </div>
      </section>

      <DistributionCard channel={channel} canManage onChange={updateChannel} />

      <CollaboratorsCard channel={channel} canManage />

      <ChannelSyncSection channels={[channel]} />

      <section aria-labelledby="channel-danger-heading" className="flex flex-col gap-3">
        <h2 id="channel-danger-heading" className="text-[15px] font-bold tracking-tight">
          {t("studio.channel.danger")}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{t("studio.channel.deleteTitle")}</p>
            <p className="text-[13px] text-fg-muted">
              {t("studio.channel.deleteWarning", { handle: channel.handle })}
            </p>
          </div>
          {confirmingDelete ? (
            <div className="flex shrink-0 items-center gap-1 text-sm">
              <span className="text-[13px] text-fg-muted">{t("studio.channel.deleteAsk")}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className={`${ROW_ACTION} text-danger hover:bg-danger-surface`}
              >
                {t("studio.channel.confirm")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
                className={`${ROW_ACTION} text-fg-muted hover:bg-surface-strong hover:text-fg`}
              >
                {t("studio.channel.cancel")}
              </button>
            </div>
          ) : (
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              aria-label={t("studio.channel.deleteAria", { handle: channel.handle })}
            >
              {t("studio.channel.delete")}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

// ChannelManageView is the Studio Channel tab: manage the current channel, or —
// when the caller has no channels yet — the onboarding create form. `?create=1`
// opens the create-another-channel dialog (reported back so the caller strips
// the param).
export function ChannelManageView({
  autoCreate = false,
  onAutoCreateConsumed,
}: {
  autoCreate?: boolean;
  onAutoCreateConsumed?: () => void;
}) {
  const t = useT();
  const { channels, currentChannel, addChannel } = useStudio();
  const [manualOpen, setManualOpen] = useState(false);
  // The create-channel dialog is a bottom sheet on phones (matchMedia guarded for
  // non-browser test envs), matching the stepped upload + go-live sheets.
  const [sheet] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 767px)").matches,
  );
  // The dialog is open when opened manually OR when the `?create=1` deep link is
  // present and there is at least one channel (with none, the inline onboarding
  // form is the primary UI). Derived, not an effect — so no setState-in-effect.
  const dialogOpen = manualOpen || (autoCreate && channels.length > 0);

  // Closing strips the `?create=1` param (a no-op when it was opened manually).
  function closeDialog() {
    setManualOpen(false);
    onAutoCreateConsumed?.();
  }

  if (channels.length === 0) {
    return (
      <section aria-labelledby="channel-onboarding-heading" className="flex flex-col gap-4">
        <EmptyState
          icon={<VideoIcon size={24} />}
          title={t("studio.channel.firstTitle")}
          message={t("studio.channel.firstMessage")}
        />
        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <h2 id="channel-onboarding-heading" className="mb-3 text-[15px] font-bold tracking-tight">
            {t("studio.channel.newHeading")}
          </h2>
          <CreateChannelForm autoFocus onCreated={addChannel} />
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {currentChannel ? (
        <CurrentChannelPanel key={currentChannel.id} channel={currentChannel} />
      ) : null}

      <div className="border-t border-border-subtle pt-5">
        <Button variant="tonal" size="sm" onClick={() => setManualOpen(true)}>
          {t("studio.channel.createAnother")}
        </Button>
      </div>

      {dialogOpen ? (
        <Modal
          title={t("studio.channel.createCta")}
          onClose={closeDialog}
          variant={sheet ? "sheet" : "dialog"}
          className="sm:max-w-lg"
        >
          <CreateChannelForm
            autoFocus
            onCreated={(ch) => {
              addChannel(ch);
              closeDialog();
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
