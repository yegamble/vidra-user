"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { QuotaStatus } from "@/lib/api";
import { formatBytes } from "@/lib/format";

// StudioStorageCard — the design's Studio "Storage" card (iCloud pattern),
// bound to the REAL GET /api/v1/me/quota contract ({ used_bytes,
// quota_bytes|null, daily_used_bytes, daily_quota_bytes|null }). Elevated
// surface card (soft shadow): "Storage" label + "X of Y" (or "X used" when
// unlimited) + an iCloud-style segmented capacity bar (surface-strong track,
// accent used segment inset with a hairline gap so the used/free split reads as
// distinct segments) with a Used/Free legend, plus a "Daily uploads" footnote
// with the remaining rolling-24h headroom when the instance sets a daily quota
// (config-parity W7).
//
// NOTE — iCloud shows a *per-media-kind* segmented bar (Photos/Backups/…). The
// quota contract here reports ONE aggregate `used_bytes` (originals + renditions
// + thumbnails combined; no per-kind field — verified against the OpenAPI
// schema), so an honest bar can only segment used-vs-free. A fabricated per-kind
// split would violate the redesign's "never invent numbers" rule, so the segment
// stays a truthful two-tone meter. Purely informational, so a load failure hides
// the card rather than showing a broken/faked meter.
export function StudioStorageCard() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyQuota(controller.signal)
      .then(setQuota)
      .catch(() => {
        // Non-blocking summary: on any failure the card simply doesn't render.
      });
    return () => controller.abort();
  }, []);

  if (!quota) return null;

  const { used_bytes: used, quota_bytes: total } = quota;
  const unlimited = total === null;
  // Rolling daily window (W7): null quota = no daily limit configured; shown
  // only when finite. Remaining clamps at 0 for an already-exhausted window.
  const dailyQuota = quota.daily_quota_bytes ?? null;
  const dailyRemaining = dailyQuota === null ? null : Math.max(0, dailyQuota - quota.daily_used_bytes);
  // Clamp the fill to 0–100 so an over-quota account (used > quota) can't paint a
  // bar wider than its track.
  const percent =
    unlimited || total === 0 ? 0 : Math.min(100, Math.max(0, Math.round((used / total) * 100)));

  return (
    <section
      aria-label="Storage"
      className="flex flex-col gap-2.5 rounded-2xl bg-surface px-4 py-3.5 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-semibold text-fg">Storage</span>
        <span className="tabular-nums text-fg-muted">
          {unlimited ? `${formatBytes(used)} used` : `${formatBytes(used)} of ${formatBytes(total)}`}
        </span>
      </div>
      {unlimited ? (
        <p className="text-[12.5px] text-fg-muted">Unlimited on this instance.</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="flex h-3 items-stretch gap-[3px] overflow-hidden rounded-full bg-surface-strong p-[1.5px]"
          >
            {/* iCloud segmented capacity bar: the used segment is inset with a
                hairline gap so used/free read as distinct segments. Hidden below
                ~2% so a near-empty account doesn't paint a stray dot. */}
            {percent >= 2 ? (
              <div className="rounded-full bg-accent" style={{ width: `${percent}%` }} />
            ) : null}
          </div>
          <div className="flex items-center gap-4 text-[12px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
              Used
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-surface-strong" />
              Free
            </span>
          </div>
        </>
      )}
      {dailyRemaining !== null && dailyQuota !== null ? (
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-fg-muted">Daily uploads</span>
          <span className="tabular-nums text-fg-muted">
            {formatBytes(dailyRemaining)} left of {formatBytes(dailyQuota)} per 24h
          </span>
        </div>
      ) : null}
    </section>
  );
}
