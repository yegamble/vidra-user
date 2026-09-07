"use client";

import { useState } from "react";

import { EyeOffIcon, MoreVerticalIcon, SlashCircleIcon } from "@/components/icons";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { api } from "@/lib/api";
import type { SettledSession } from "@/lib/use-settled-session";
import { recordViewerModeration, useViewerModeration } from "@/lib/use-viewer-moderation";

/**
 * AccountModerationMenu — mute or block THIS account, from wherever the account
 * is on screen.
 *
 * Until the A16 ruling the only place to mute or block was a comment's overflow
 * menu (`api.muteAccount`'s single call site), so an account that never
 * commented could not be muted from the UI at all — you could see every video
 * they published and have no way to stop seeing them. This is the same menu, on
 * the two pages that are ABOUT an account: its channel and its profile. One
 * component rather than two, because two would drift, and the labels are the
 * comment menu's labels verbatim so the same action reads the same everywhere.
 *
 * It renders nothing for an anonymous visitor (there is nobody to mute for) and
 * nothing on your own channel or profile (a self-mute is 422). The current
 * state comes from the shared per-session read, so the menu opens on "Unmute"
 * for an account already muted rather than offering an action already taken;
 * while that read is in flight or after it failed, the menu shows the plain
 * actions, and both verbs are idempotent server-side (204 either way), so the
 * worst case is a redundant call, never a wrong one.
 */
export function AccountModerationMenu(props: AccountModerationMenuProps) {
  // Nothing to offer an anonymous visitor, and a self-mute is 422 — so both
  // render no control at all rather than one whose every item would fail.
  //
  // `!authed` also covers a session still restoring, which is deliberate: the
  // menu's labels depend on who is asking, and showing "Mute" for half a second
  // to someone who has already muted it would be worse than showing nothing.
  if (!props.session.authed || props.session.viewerId === props.accountId) return null;
  return <AccountModerationMenuForViewer {...props} />;
}

interface AccountModerationMenuProps {
  /** The account being moderated — a channel's `owner_id`, a profile's `id`. */
  accountId: string;
  /**
   * For the trigger's accessible name, so a screen-reader user hears WHO the
   * menu acts on rather than counting anonymous "More" buttons on a page.
   */
  accountName: string;
  /**
   * The handles this account publishes under, as far as the calling page knows
   * them: a channel page knows the one it is showing, a profile page knows all
   * of them. Threaded through so the header's search box drops this account's
   * suggestions immediately, without waiting for the next session's read.
   */
  channelHandles?: string[];
  /**
   * The settled session, from whichever variant the host surface already holds
   * (`useSettledSession` under an `AuthProvider`, the optional one where the
   * surface can render bare). Passed in rather than read here so the menu adds
   * no second session read to a page that already has one.
   */
  session: SettledSession;
}

function AccountModerationMenuForViewer({
  accountId,
  accountName,
  channelHandles,
  session,
}: AccountModerationMenuProps) {
  const { ready, mutedIds, blockedIds } = useViewerModeration(session);
  const [busy, setBusy] = useState(false);
  const viewerKey = session.viewerKey;

  const muted = ready && mutedIds.has(accountId);
  const blocked = ready && blockedIds.has(accountId);

  async function run(call: () => Promise<void>, change: { muted?: boolean; blocked?: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      await call();
      // Publishing the change is what makes the surrounding page follow at
      // once — the channel page hides its own videos, the search box drops the
      // account's suggestions — with no reload and no refetch. A hard reload
      // then shows the same thing because the SERVER applies the same
      // predicate; the local update only spares the viewer the wait.
      recordViewerModeration(viewerKey, { userId: accountId, channelHandles, ...change });
    } catch {
      // Silent, and deliberately the same as the comment menu's Mute and Block:
      // nothing is recorded, so the label does not flip and the viewer sees
      // that the action did not take. Neither control reports the failure, which
      // is a gap they share rather than one this one introduces.
    } finally {
      setBusy(false);
    }
  }

  const items: DropdownItem[] = [
    muted
      ? {
          label: "Unmute",
          icon: <EyeOffIcon size={16} />,
          disabled: busy,
          onSelect: () =>
            void run(() => api.unmuteAccount(accountId), { muted: false }),
        }
      : {
          label: "Mute",
          icon: <EyeOffIcon size={16} />,
          disabled: busy,
          onSelect: () =>
            void run(() => api.muteAccount(accountId), { muted: true }),
        },
    blocked
      ? {
          label: "Unblock",
          icon: <SlashCircleIcon size={16} />,
          disabled: busy,
          onSelect: () =>
            void run(() => api.unblockUser(accountId), { blocked: false }),
        }
      : {
          label: "Block",
          icon: <SlashCircleIcon size={16} />,
          disabled: busy,
          danger: true,
          onSelect: () =>
            void run(() => api.blockUser(accountId), { blocked: true }),
        },
  ];

  return (
    <Dropdown
      trigger={<MoreVerticalIcon size={20} />}
      // Named for WHO, not just what: a page can carry several menus, and
      // "More" alone would leave a screen-reader user counting them.
      triggerLabel={`Actions for ${accountName}`}
      items={items}
      align="end"
      triggerVariant="icon"
      triggerClassName="h-9 w-9 text-fg-muted hover:text-fg"
    />
  );
}
