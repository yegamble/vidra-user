import { EmbedPlayer } from "@/components/EmbedPlayer";

// The embeddable player, meant to be iframed on other sites. Full-bleed, no app
// chrome (the Header hides on /embed routes). The video loads client-side in
// EmbedPlayer (route-mockable); this server component just resolves the id.
export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmbedPlayer id={id} />;
}
