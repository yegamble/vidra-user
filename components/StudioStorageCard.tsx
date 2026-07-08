"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { QuotaStatus } from "@/lib/api";
import { formatBytes } from "@/lib/format";

// StudioStorageCard — the design's Studio "Storage" card, bound to the REAL
// GET /api/v1/me/quota contract ({ used_bytes, quota_bytes|null }). Borderless
// surface-muted card: "Storage" label + "X of Y" (or "X used" when unlimited) +
// a 5px progress bar (surface-strong track, fg fill). Purely informational, so a
// load failure hides it rather than showing a broken/faked meter (the frontend
// truthfulness rule — never invent numbers).
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
  // Clamp the fill to 0–100 so an over-quota account (used > quota) can't paint a
  // bar wider than its track.
  const percent =
    unlimited || total === 0 ? 0 : Math.min(100, Math.max(0, Math.round((used / total) * 100)));

  return (
    <section
      aria-label="Storage"
      className="flex flex-col gap-2.5 rounded-2xl bg-surface-muted px-4 py-3.5"
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
        <div
          role="progressbar"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-[5px] overflow-hidden rounded-full bg-surface-strong"
        >
          <div className="h-full rounded-full bg-fg" style={{ width: `${percent}%` }} />
        </div>
      )}
    </section>
  );
}
