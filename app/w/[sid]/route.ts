import { peertubeShortUUIDToUUID } from "@/lib/peertube-short-uuid";
import { getPublicVideoByLegacyUUID } from "@/lib/video.server";

// /w/{shortUUID} is PeerTube's public watch path. After an operator imports a
// PeerTube instance and points its domain at Vidra, every link anyone ever
// shared to that instance arrives here — so this route is the difference
// between a migration that keeps its audience and one that drops it.
//
// The shortUUID decodes to the SOURCE video's uuid, which is NOT the id Vidra
// minted for the imported copy; vidra-core stores the source uuid on the video
// (migration 0127) and resolves it. Decoding happens HERE and not in core: the
// importer already holds the raw uuid, so no PeerTube encoding needs to cross
// the API boundary.
//
// A route handler, not a page, and deliberately: it must control its own status
// code and read the query string verbatim. Both are things a Server Component
// cannot do — see app/v/[code]/page.tsx, where a loading boundary once turned a
// 404 into a 200 and a redirect silently dropped `?t=`.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<Response> {
  const { sid } = await params;
  const sourceUUID = peertubeShortUUIDToUUID(sid);
  if (sourceUUID === null) return new Response("Not found", { status: 404 });

  const video = await getPublicVideoByLegacyUUID(sourceUUID);
  if (video === null) return new Response("Not found", { status: 404 });

  // 302, not 301, while the canonical watch URL is mid-migration. A permanent
  // redirect is cached by the browser forever, and this target is about to
  // become /v/{code}: baking in today's answer would leave every one of these
  // links taking an extra hop for good. It becomes 301 at the flip, pointing
  // straight at the final URL.
  //
  // The query string rides along so a shared `?t=` start time survives. Read
  // via the standard URL API rather than req.nextUrl, which exists only on a
  // NextRequest and is undefined for the plain Request a unit test constructs.
  return new Response(null, {
    status: 302,
    headers: { location: `/videos/${video.id}${new URL(req.url).search}` },
  });
}
