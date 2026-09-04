import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { WatchView } from "@/components/WatchView";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { getRequestOrigin } from "@/lib/request-origin";
import { isShortCode } from "@/lib/short-code";
import { shortIdToUuid } from "@/lib/short-id";
import { getPublicVideoByCode } from "@/lib/video.server";
import { buildWatchMetadata } from "@/lib/watch-metadata";

// /v/{code} serves TWO encodings, told apart by length because their ranges do
// not overlap:
//
//   11 chars    the STORED short code — this route RENDERS the watch page
//   16-22 chars the legacy DERIVED sid, a base58 re-encoding of the uuid —
//               permanently redirected to /videos/{uuid}, exactly as the route
//               handler this file replaces did
//
// The legacy band must keep redirecting forever: those links were published,
// and every browser that has followed one holds its 301 permanently. Nothing is
// stranded by this file, because a stored code is 11 characters and no 11-char
// /v/ URL was ever emitted — so none can be sitting in a redirect cache.
//
// Nothing links here yet. Cards, the share dialog and the canonical stay on
// /videos/{uuid} until the flip, so this route is additive.
//
// THERE IS DELIBERATELY NO loading.tsx HERE, and adding one silently breaks the
// 404. A loading boundary puts the segment behind Suspense, so Next streams the
// shell and commits a 200 before this component runs — notFound() then renders
// the not-found UI inside an already-200 response. Measured against a real
// build: with loading.tsx /v/not-a-valid-sid answers 200, without it 404, and
// e2e/short-url.spec.ts asserts the 404. Restoring the skeleton needs the shape
// check to move somewhere that runs before streaming (middleware), not a
// loading file.

// classify keeps the two encodings' handling in one place so the page body and
// generateMetadata cannot drift on which is which.
function classify(param: string): { kind: "code" } | { kind: "legacy"; uuid: string } | { kind: "unknown" } {
  if (isShortCode(param)) return { kind: "code" };
  const uuid = shortIdToUuid(param);
  if (uuid !== null) return { kind: "legacy", uuid };
  return { kind: "unknown" };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  if (classify(code).kind !== "code") return {};
  const [video, instance, origin] = await Promise.all([
    getPublicVideoByCode(code),
    getInstanceConfig(),
    getRequestOrigin(),
  ]);
  return buildWatchMetadata(video, instance, origin);
}

// queryString rebuilds the incoming query for the legacy redirect.
//
// The route handler this file replaces forwarded req.nextUrl.search verbatim. A
// page never sees the raw string, so it is reassembled from searchParams —
// and it MUST be, because `?t=` start times ride on these links: dropping it
// silently starts every shared timestamp link from zero.
function queryString(sp: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out.append(k, v);
    else if (Array.isArray(v)) for (const one of v) out.append(k, one);
  }
  const s = out.toString();
  return s === "" ? "" : `?${s}`;
}

export default async function ShortCodeWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const what = classify(code);

  if (what.kind === "legacy") {
    // Unchanged behaviour, and deliberately not resolved to a short code here:
    // /videos/{uuid} is still the canonical watch URL, so sending the viewer
    // anywhere else would move the canonical ahead of the rest of the system.
    permanentRedirect(`/videos/${what.uuid}${queryString(await searchParams)}`);
  }
  if (what.kind === "unknown") {
    // Neither encoding. 404 without spending a backend round trip.
    notFound();
  }

  // A null seed is the ordinary path for a private, password-protected or
  // backend-unreachable video: WatchView refetches by code with the viewer's
  // session, and a password_required 401 carries the uuid its unlock prompt
  // needs.
  const initialVideo = await getPublicVideoByCode(code);
  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
      <WatchView key={code} code={code} initialVideo={initialVideo} />
    </main>
  );
}
