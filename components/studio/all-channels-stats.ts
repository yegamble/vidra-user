import { api } from "@/lib/api";
import type { Channel, DailyViews } from "@/lib/api";

// The per-channel rollup row the "All channels" scope shows, matching the fields
// the future GET /api/v1/me/stats endpoint returns per channel.
export type ChannelBreakdown = {
  id: string;
  handle: string;
  display_name: string;
  views: number;
  followers: number;
  videos: number;
  views_28d: number;
};

// AllChannelsStats mirrors the planned GET /api/v1/me/stats response shape so the
// Phase-C swap (client aggregate → backend endpoint) is a one-function change.
export type AllChannelsStats = {
  totals: {
    views: number;
    likes: number;
    dislikes: number;
    comments: number;
    followers: number;
    videos: number;
  };
  daily_views: DailyViews[];
  channels: ChannelBreakdown[];
};

// views28d sums the last 28 entries of a (≤30-day) daily-views series — the
// design's "Views · 28 days" headline. Real data only (never pads/extrapolates).
export function views28d(daily: DailyViews[]): number {
  return daily.slice(-28).reduce((sum, d) => sum + d.views, 0);
}

// getAllChannelsStats — Phase B client-side aggregate across every channel the
// caller owns: parallel GET /channels/{handle}/stats, summed totals, a daily
// series merged by day, and a per-channel breakdown. Phase C replaces the BODY
// of this one function with a single GET /api/v1/me/stats call (its response is
// already this exact shape) — the call sites do not change.
export async function getAllChannelsStats(
  channels: Channel[],
  signal?: AbortSignal,
): Promise<AllChannelsStats> {
  const results = await Promise.all(
    channels.map((c) => api.getChannelStats(c.handle, signal)),
  );

  const totals = { views: 0, likes: 0, dislikes: 0, comments: 0, followers: 0, videos: 0 };
  const dailyByDay = new Map<string, number>();
  const breakdown: ChannelBreakdown[] = [];

  results.forEach((stats, i) => {
    const c = channels[i];
    totals.views += stats.views;
    totals.likes += stats.likes;
    totals.dislikes += stats.dislikes;
    totals.comments += stats.comments;
    totals.followers += stats.followers;
    totals.videos += stats.videos;
    for (const d of stats.daily_views) {
      dailyByDay.set(d.day, (dailyByDay.get(d.day) ?? 0) + d.views);
    }
    breakdown.push({
      id: c.id,
      handle: c.handle,
      display_name: c.display_name,
      views: stats.views,
      followers: stats.followers,
      videos: stats.videos,
      views_28d: views28d(stats.daily_views),
    });
  });

  const daily_views: DailyViews[] = [...dailyByDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([day, views]) => ({ day, views }));

  // Most-viewed channels first — the natural reading order for a rollup table.
  breakdown.sort((a, b) => b.views - a.views);

  return { totals, daily_views, channels: breakdown };
}
