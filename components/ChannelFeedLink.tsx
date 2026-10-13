import { RssIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/Button";
import { apiBaseUrl } from "@/lib/config";

/** The channel's podcast feed (enclosures a podcast app can play), as a visible link. */
export function podcastFeedUrl(handle: string): string {
  return `${apiBaseUrl}/feeds/podcast/videos.xml?channel=${encodeURIComponent(handle)}`;
}

export function ChannelFeedLink({ handle, name }: { handle: string; name: string }) {
  return (
    <a
      href={podcastFeedUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Podcast feed for ${name}`}
      title="Podcast feed (RSS)"
      className={buttonClasses("ghost", "sm")}
    >
      <RssIcon size={18} />
    </a>
  );
}
