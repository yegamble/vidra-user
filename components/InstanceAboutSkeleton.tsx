import { InfoIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/Skeleton";

/** The About page's real silhouette, used only when server bootstrapping fails. */
export function InstanceAboutSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading instance details"
      data-testid="instance-about-skeleton"
      className="flex min-w-0 flex-col gap-7"
    >
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        <InfoIcon size={24} />
        About
      </h1>

      <div aria-hidden className="overflow-hidden rounded-[26px] border border-border-subtle bg-surface-muted">
        <Skeleton className="h-20 w-full rounded-none sm:h-28" />
        <div className="flex items-center gap-4 p-5 sm:p-6">
          <Skeleton className="h-16 w-16 shrink-0 rounded-2xl sm:h-20 sm:w-20" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-48 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-4">
        <div className="flex gap-6 border-b border-border pb-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-16 rounded-full" />
          <Skeleton className="h-9 w-48 rounded-full" />
        </div>
      </div>

      <div aria-hidden className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-52 w-full rounded-2xl" />
      </div>
      <span className="sr-only">Loading instance details…</span>
    </div>
  );
}
