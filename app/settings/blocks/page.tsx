import { BlockedUsersView } from "@/components/BlockedUsersView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

// The description used to promise only the messaging half, which under-sold
// what a block does: core filters a blocked account's videos out of every
// discovery surface and their comments out of every thread, for the blocker,
// exactly as a mute does — ListPublicVideosSorted and ListComments carry the
// same `user_blocks` predicate as `muted_accounts`. The two pages now describe
// the same hiding, and the block adds the one thing a mute does not do.
export default function BlockedUsersPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Blocked accounts"
        description="Accounts you have blocked. Their videos and comments are hidden from you, and neither of you can send the other a direct message."
      />
      <BlockedUsersView />
    </main>
  );
}
