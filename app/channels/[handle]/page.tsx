import { ChannelView } from "@/components/ChannelView";

export default async function ChannelPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-4 sm:pt-6">
      <ChannelView key={handle} handle={handle} />
    </main>
  );
}
