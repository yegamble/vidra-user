import { ConversationView } from "@/components/ConversationView";

// A direct-message thread. The messages load client-side in ConversationView
// (route-mockable, refetchable); this server component resolves the dynamic id.
// `to` is the encrypted-thread recipient hint (see StartEncryptedButton) so the
// encrypted composer can fan out to the peer without a participant lookup.
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ to?: string }>;
}) {
  const { id } = await params;
  const { to } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <ConversationView conversationId={id} recipientHint={to} />
    </main>
  );
}
