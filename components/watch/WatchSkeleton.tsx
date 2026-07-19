import { Skeleton } from "@/components/ui/Skeleton";

// Watch-surface skeleton in WatchView's exact silhouette: player stage, title,
// meta line, channel row, action pills, then the related rail (lg:w-[344px],
// 150px-thumb rows — see RelatedVideos). Used by BOTH the route loading
// boundary (app/videos/[id]/loading.tsx) and WatchView's client-fetch phase,
// so the navigation → hydration → data handoff holds one steady layout
// instead of flashing grid skeleton → centered spinner → two-column page.
export function WatchSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-7">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-3/4 rounded-lg" />
          <Skeleton className="h-3.5 w-40" />
          <div className="flex items-center gap-3 py-1">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* The joined like/dislike rating pill stays capsule; the single
                action buttons (Save/Share/Download) are rounded-[10px]. */}
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-[10px]" />
            <Skeleton className="h-9 w-24 rounded-[10px]" />
            <Skeleton className="hidden h-9 w-24 rounded-[10px] sm:block" />
          </div>
        </div>
      </div>
      <div className="hidden w-full shrink-0 flex-col gap-3.5 lg:flex lg:w-[344px]">
        <Skeleton className="h-3.5 w-28" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="aspect-video w-[150px] shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
