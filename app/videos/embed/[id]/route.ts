import { legacyEmbedSearch } from "@/lib/legacy-redirect";
import { peertubeShortUUIDToUUID } from "@/lib/peertube-short-uuid";
import { getPublicVideoByLegacyUUID } from "@/lib/video.server";

// /videos/embed/{uuid|shortUUID} is PeerTube's iframe path. Every <iframe> that
// third-party sites embedded from a migrated instance points here, so a 404 is
// a broken player on someone else's page.
//
// Redirects to /embed/{id}. proxy.ts marks THIS path frameable too: a browser
// checks frame-ancestors on the redirect response as well as the final one, so
// a hop that said frame-ancestors 'self' would blank the iframe before
// /embed ever answered. Embed privacy is NOT decided here — an id core will
// not resolve is handed on as-is and /embed applies its own rules.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let video = await getPublicVideoByLegacyUUID(id);
  if (video === null) {
    const decoded = peertubeShortUUIDToUUID(id);
    if (decoded !== null) video = await getPublicVideoByLegacyUUID(decoded);
  }
  const target = video === null ? id : video.id;
  return new Response(null, {
    status: 302,
    headers: { location: `/embed/${encodeURIComponent(target)}${legacyEmbedSearch(new URL(req.url).search)}` },
  });
}
