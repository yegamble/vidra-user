import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { Channel } from "@/lib/api";

// ChannelProtocolBadges — the compact "where this channel's videos travel" chips
// used on the StudioNav identity/switcher rows and the dashboard distribution
// card. Protocol identity is colored INSIDE the Badge only (the guardrail-correct
// `Badge variant="protocol"`: brand tint + full-strength dot + neutral label),
// never as a ribbon or free-floating color. Reads the channel's effective status:
// ActivityPub from `activitypub_enabled`, ATProto/Bluesky from `atproto_active`
// (which already folds in the linked account + instance extension). A channel
// that federates nowhere reads as a neutral "Local only" chip.
export function ChannelProtocolBadges({
  channel,
  className,
}: {
  channel: Channel;
  className?: string;
}) {
  const activitypub = channel.activitypub_enabled;
  const atproto = channel.atproto_active === true;

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {activitypub ? (
        <Badge variant="protocol" protocol="activitypub">
          ActivityPub
        </Badge>
      ) : null}
      {atproto ? (
        <Badge variant="protocol" protocol="bluesky">
          ATProto
        </Badge>
      ) : null}
      {!activitypub && !atproto ? <Badge variant="neutral">Local only</Badge> : null}
    </span>
  );
}
