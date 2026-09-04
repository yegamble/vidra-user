import { getPublicVideoByLegacyUUID } from "@/lib/video.server";
import { watchPath } from "@/lib/watch-path";

// /videos/watch/{uuid} is the legacy watch path, and it carries TWO namespaces:
//
//   - this instance's own video id, the form vidra-core used to mint in its
//     ActivityPub objects. Those ids live in remote servers' databases, out of
//     our reach, so this path is kept forever.
//   - the SOURCE uuid of a video imported from PeerTube, whose own legacy path
//     this also is.
//
// It replaces a next.config.ts redirect that rewrote /videos/watch/:id to
// /videos/:id blindly. That was right for the first namespace and WRONG for the
// second: a PeerTube uuid is not a Vidra id, so every imported instance's legacy
// link 404'd. Core resolves both with one lookup.
//
// (That redirect's comment also claimed core still emits this form and the rule
// could not be removed until core minted /videos/{id}. Core stopped emitting it
// in core#147; the only remaining reference is a deliberate inbound parser.)
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const video = await getPublicVideoByLegacyUUID(id);

  // Falling back to /videos/{id} rather than 404ing keeps the behaviour the
  // next.config rule had for an unresolvable id: the watch page renders and
  // reports "not found" itself, and a private video still reaches its owner
  // through the authenticated client fetch. Never worse than before.
  //
  // A resolved video goes straight to its canonical /v/{code} — one hop, not
  // two via /videos/{uuid}, which now renders rather than redirects.
  const search = new URL(req.url).search;
  const location = video === null ? `/videos/${encodeURIComponent(id)}${search}` : watchPath(video, search);

  // Still 302, NOT 301; see app/w/[sid]/route.ts for why.
  return new Response(null, { status: 302, headers: { location } });
}
