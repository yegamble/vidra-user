import type { NextRequest } from "next/server";

import { shortIdToUuid } from "@/lib/short-id";

// The short share alias REDIRECTS instead of rendering: /videos/{id} stays the
// single canonical watch URL, so og:/oEmbed metadata, view counting and crawler
// dedup all keep seeing one address no matter which link was shared. The query
// string rides along verbatim so `/v/<sid>?t=90` still starts at 0:90.
// force-dynamic matches the repo's other route handlers — the response depends
// on the incoming URL, never on a body baked at build time.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
): Promise<Response> {
  const { sid } = await params;
  const id = shortIdToUuid(sid);
  if (id === null) return new Response("Not found", { status: 404 });
  // A relative Location keeps the redirect on whatever origin the user reached
  // (proxy, custom domain) without trusting a reconstructed absolute origin.
  return new Response(null, {
    status: 301,
    headers: { location: `/videos/${id}${req.nextUrl.search}` },
  });
}
