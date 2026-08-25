import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { channelAvatarUrl, userAvatarUrl } from "@/lib/api";
import type { AccountSearchResult, Channel } from "@/lib/api";
import { formatCount, pluralize } from "@/lib/format";

// The two identity cards — a channel and an account — as they appear anywhere a
// list of them is shown: the profile page's channel grid and the search page's
// Channels / Accounts results. One avatar size, one name/handle stack, one
// tertiary line, so a channel looks like a channel wherever it is met.
//
// `ChannelResultCard` was the profile page's own `ProfileChannelCard`; the
// account card is its sibling, built on the same grid so the two tabs of search
// results do not visibly disagree about what an identity looks like. Both are
// whole-card links to the canonical surface for that identity.

const CARD =
  "focus-ring flex h-full gap-3 rounded-2xl bg-surface-muted p-4 transition-colors hover:bg-surface-strong";

export function ChannelResultCard({ channel }: { channel: Channel }) {
  const name = channel.display_name || channel.handle;
  return (
    <Link href={`/channels/${encodeURIComponent(channel.handle)}`} className={CARD}>
      <Avatar
        src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null}
        name={name}
        className="h-12 w-12 shrink-0"
      />
      <span className="min-w-0">
        <span className="block truncate text-subhead font-semibold text-fg">{name}</span>
        <span className="block truncate text-footnote text-fg-muted">@{channel.handle}</span>
        <span className="mt-1 block text-footnote tabular-nums text-fg-muted">
          {formatCount(channel.follower_count)} {pluralize(channel.follower_count, "follower")}
        </span>
      </span>
    </Link>
  );
}

/**
 * An account search hit. `AccountSearchResult` is a strict subset of
 * `PublicUserProfile`, so this card also renders a full profile object — but it
 * reads only the subset, which is what keeps it usable from the search list
 * where the channel array and Bluesky handle are (deliberately) absent.
 *
 * The tertiary line is the bio rather than a count: an account has no follower
 * number of its own, and inventing "0 channels" from a field the search result
 * does not carry would be a lie the card cannot check.
 */
export function AccountResultCard({ account }: { account: AccountSearchResult }) {
  const name = account.display_name || account.username;
  return (
    <Link href={`/users/${encodeURIComponent(account.username)}`} className={CARD}>
      <Avatar
        src={account.has_avatar ? userAvatarUrl(account.id) : null}
        name={name}
        className="h-12 w-12 shrink-0"
      />
      <span className="min-w-0">
        <span className="block truncate text-subhead font-semibold text-fg">{name}</span>
        <span className="block truncate text-footnote text-fg-muted">@{account.username}</span>
        {account.bio ? (
          <span className="mt-1 line-clamp-2 block text-footnote text-fg-muted">{account.bio}</span>
        ) : null}
      </span>
    </Link>
  );
}
