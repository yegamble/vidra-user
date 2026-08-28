// One server-side JSON read of vidra-core, for the handful of route/metadata
// bootstraps that fetch a public document before their HTML streams.
//
// Every one of them wants the same body — build the URL, ask for JSON, treat a
// non-OK response as absent, parse, and swallow anything thrown — and they
// differ only in three knobs that MUST stay per-site:
//
//   freshness       Whether the read bypasses the Next data cache (a navigation
//                   destination, or a document whose staleness is a correctness
//                   bug) or revalidates on a window (site metadata).
//   forwardClientIp Whether the viewer's IP rides along so vidra-core's per-IP
//                   limiter buckets the read under the VIEWER rather than under
//                   the frontend container. Only legal on an uncached,
//                   per-request read — see lib/client-ip.server.ts, whose skip
//                   list explains which call sites must never grow one.
//   timeoutMs       Whether an unreachable backend fails fast or hangs on the
//                   platform default.
//
// Callers keep their own post-parse validation (an empty body is not the same
// as a missing one) and their own React cache() wrapper.

import { clientIpForwardHeaders } from "@/lib/client-ip.server";
import { internalApiBaseUrl } from "@/lib/config";

/**
 * "no-store" bypasses the Next data cache entirely; a number revalidates the
 * cached entry after that many seconds.
 */
export type ServerJsonFreshness = "no-store" | { revalidateSeconds: number };

export type ServerJsonOptions<T> = {
  freshness: ServerJsonFreshness;
  /** Bill the read to the viewer's rate-limit bucket. Uncached reads only. */
  forwardClientIp?: boolean;
  /** Abort the read after this many milliseconds. Omitted ⇒ no timeout. */
  timeoutMs?: number;
  /** Value to resolve for a 404, when "absent" is a valid, stable state rather than a failure. */
  on404?: T;
};

/**
 * Read one public JSON document from vidra-core server-side. Anonymous (no
 * bearer token — it sees exactly what a link-preview crawler sees) and it never
 * throws: an unreachable backend, a non-OK status, a timeout, or a non-JSON body
 * all resolve to null so the caller degrades to its fallback instead of erroring
 * the page.
 *
 * `path` is everything after the API base, e.g. `/api/v1/instance`.
 */
export async function serverJson<T>(
  path: string,
  options: ServerJsonOptions<T>,
): Promise<T | null> {
  try {
    const res = await fetch(`${internalApiBaseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        ...(options.forwardClientIp ? await clientIpForwardHeaders() : {}),
      },
      ...(options.freshness === "no-store"
        ? { cache: "no-store" as const }
        : { next: { revalidate: options.freshness.revalidateSeconds } }),
      ...(options.timeoutMs === undefined
        ? {}
        : { signal: AbortSignal.timeout(options.timeoutMs) }),
    });
    if (res.status === 404 && options.on404 !== undefined) return options.on404;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
