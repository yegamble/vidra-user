import { legacyPlaylistEmbedSearch } from "@/lib/legacy-redirect";

// /video-playlists/embed/{id} is PeerTube's playlist iframe path. Third-party
// pages that embedded a migrated instance's playlist point here, so a 404 is a
// broken player on someone else's page.
//
// Redirects to /embed/playlists/{id}. proxy.ts marks THIS path frameable too (a
// browser checks frame-ancestors on the redirect response as well as the final
// one). The id is handed on as-is: vidra keeps no legacy-uuid index for
// playlists, and /embed/playlists applies visibility itself.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return new Response(null, {
    status: 302,
    headers: {
      location: `/embed/playlists/${encodeURIComponent(id)}${legacyPlaylistEmbedSearch(new URL(req.url).search)}`,
    },
  });
}
