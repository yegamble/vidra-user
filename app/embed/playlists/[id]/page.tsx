import { PlaylistEmbedPlayer } from "@/components/PlaylistEmbedPlayer";

// The embeddable playlist player (PeerTube's /video-playlists/embed/{id}).
// Full-bleed, no app chrome (/embed is a standalone route). The playlist loads
// client-side in PlaylistEmbedPlayer (route-mockable); this server component
// just resolves the id.
export default async function PlaylistEmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaylistEmbedPlayer id={id} />;
}
