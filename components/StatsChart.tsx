import type { DailyViews } from "@/lib/api";

// StatsChart renders a dense daily-views series (oldest first, zero-filled by
// the backend) as an inline SVG bar chart — no chart library, per the design
// system. Purely presentational; parents supply the series from the stats
// endpoints. The whole chart carries an accessible summary label and each bar
// a <title> tooltip; an all-zero month is stated honestly in the caption.
export function StatsChart({ series, label }: { series: DailyViews[]; label: string }) {
  const total = series.reduce((sum, d) => sum + d.views, 0);
  const max = Math.max(...series.map((d) => d.views), 1);
  const width = 300;
  const height = 80;
  const step = width / Math.max(series.length, 1);
  const barWidth = Math.max(step - 1.5, 1);

  return (
    <figure className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}: ${total} views over the last ${series.length} days`}
        preserveAspectRatio="none"
        className="h-24 w-full rounded-xl border border-border-subtle bg-surface"
      >
        {series.map((d, i) => {
          // Zero days render as a 1px baseline sliver so every day is visible
          // (and hoverable) without pretending views happened.
          const h = d.views === 0 ? 1 : Math.max((d.views / max) * (height - 6), 2);
          return (
            <rect
              key={d.day}
              x={i * step + 0.75}
              y={height - h}
              width={barWidth}
              height={h}
              className={d.views === 0 ? "fill-surface-strong" : "fill-fg"}
            >
              <title>{`${d.day}: ${d.views} ${d.views === 1 ? "view" : "views"}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="text-xs text-fg-muted">
        {total === 0
          ? `No views in the last ${series.length} days.`
          : `Daily views over the last ${series.length} days, oldest first.`}
      </figcaption>
    </figure>
  );
}
