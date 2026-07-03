import { api } from "./endpoints";
import type { VideoConfigOption, VideoConfigResponse } from "./types";

// The metadata taxonomy (GET /videos/config) is static per instance, but several
// surfaces need it (studio selects, watch-page chips). Cache the promise at the
// module level so one page load fetches it at most once; a failed fetch clears
// the cache so the next caller retries instead of being stuck on a rejection.
let cached: Promise<VideoConfigResponse> | null = null;

/** getVideoConfigCached returns the taxonomy, fetching it at most once per load. */
export function getVideoConfigCached(): Promise<VideoConfigResponse> {
  if (!cached) {
    cached = api.getVideoConfig().catch((err: unknown) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Test-only: forget the cached taxonomy so unit tests stay independent. */
export function resetVideoConfigCacheForTests(): void {
  cached = null;
}

/**
 * resolveOptionLabel maps a taxonomy id to its human label, falling back to the
 * raw id when the options are unavailable (config fetch failed) or the id is
 * unknown (e.g. a value the backend added after this client was built).
 */
export function resolveOptionLabel(
  options: VideoConfigOption[] | undefined,
  id: string,
): string {
  return options?.find((o) => o.id === id)?.label ?? id;
}
