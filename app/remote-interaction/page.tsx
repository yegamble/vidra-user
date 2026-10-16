import { RemoteInteractionView } from "@/components/RemoteInteractionView";
import { parseInteractionUri } from "@/lib/remote-interaction";

// The inbound half of remote interaction. Another server sends its user here
// (the WebFinger subscribe template advertises /remote-interaction?uri={uri})
// so they can follow or open that content from their account on this
// instance. The lookup is client-side in RemoteInteractionView because it is
// viewer-scoped; this server component only normalises ?uri=.
export default async function RemoteInteractionPage({
  searchParams,
}: {
  searchParams: Promise<{ uri?: string | string[] }>;
}) {
  const { uri } = await searchParams;
  const first = Array.isArray(uri) ? uri[0] : uri;
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <RemoteInteractionView uri={parseInteractionUri(first)} />
    </main>
  );
}
