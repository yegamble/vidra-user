import { ConversationView } from "@/components/ConversationView";

// A direct-message thread. The messages load client-side in ConversationView
// (route-mockable, refetchable); this server component resolves the dynamic id.
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <ConversationView conversationId={id} />
    </main>
  );
}
