export const live = {
  // ChannelUpcomingBadge (public channel page). `{when}` is a formatted date-time.
  "live.upcoming.label": "Upcoming",
  "live.upcoming.streamTitle": ": {title}",
  // LiveNowRail (home/feed). `{count}` / `{viewers}` are passed as Strings (no digit grouping).
  "live.rail.label": "Live now",
  "live.rail.heading": "Live now",
  "live.rail.streams": { one: "{count} stream", other: "{count} streams" },
  "live.rail.cardLabel": "{title}, live now — {channel}",
  "live.rail.badge": "Live",
  "live.rail.watching": "{viewers} watching",
} as const;
