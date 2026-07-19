import { api } from "@/lib/api";
import type { AccountChannelStats, AccountStatsResponse, DailyViews } from "@/lib/api";

// The per-channel rollup row the "All channels" scope shows — the backend's
// AccountChannelStats (id, handle, display_name, views, followers, videos,
// views_28d).
export type ChannelBreakdown = AccountChannelStats;

// The account-level stats shape — the backend's AccountStatsResponse:
// { totals, daily_views (field `day`), channels }.
export type AllChannelsStats = AccountStatsResponse;

// views28d sums the last 28 entries of a (≤30-day) daily-views series — the
// design's "Views · 28 days" headline. Real data only (never pads/extrapolates).
export function views28d(daily: DailyViews[]): number {
  return daily.slice(-28).reduce((sum, d) => sum + d.views, 0);
}

// getAllChannelsStats — Phase C: the account-level rollup across every channel
// the caller OWNS is now a single owner-scoped backend call (GET /api/v1/me/stats).
// Its response is already this exact shape (summed totals, the aggregated 30-day
// daily series with a `day` field, and a per-channel breakdown), so the Phase-B
// client-side fan-out over getChannelStats is retired.
export function getAllChannelsStats(signal?: AbortSignal): Promise<AllChannelsStats> {
  return api.getMyStats(signal);
}
