import { RemoteWatchView } from "@/components/RemoteWatchView";

// The remote watch surface — the destination remote (federated) feed/search
// cards link to. The metadata loads client-side in RemoteWatchView
// (route-mockable, refetchable); this server component just resolves the
// dynamic id.
export default async function RemoteWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <RemoteWatchView id={id} />
    </main>
  );
}
