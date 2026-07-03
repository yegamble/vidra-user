import { LiveWatchView } from "@/components/LiveWatchView";

// The live watch page: viewers reach it from a channel's "Live now" badge. The
// stream itself loads client-side in LiveWatchView (route-mockable, refetchable);
// this server component just resolves the dynamic id.
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <LiveWatchView key={id} id={id} />
    </main>
  );
}
