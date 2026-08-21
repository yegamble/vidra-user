import { cn } from "@/lib/cn";

export type ProgressBarProps = {
  /** Percent complete. Clamped to 0–100 so a bad server number cannot overflow the track. */
  value: number;
  /** Accessible name — the bar is the progressbar node, so it must say what is progressing. */
  label: string;
  className?: string;
};

/**
 * ProgressBar — the admin surfaces' determinate progress track. Extracted from
 * AdminJobRunsView's job-run cell so the storage-migration card could show
 * progress without a third hand-rolled bar drifting from it. It is the bar
 * ONLY: the caller owns the caption line above it, because a job run captions
 * with its stage and a migration campaign captions with an object count.
 *
 * (The upload surfaces keep their own bars — those are inline in a queue row
 * with different geometry, and dragging them in here would be a rewrite rather
 * than a reuse.)
 */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-strong", className)}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}
