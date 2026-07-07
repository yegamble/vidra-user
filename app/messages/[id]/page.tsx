import { ConversationView } from "@/components/ConversationView";

// A direct-message thread. The messages load client-side in ConversationView
// (route-mockable, refetchable); this server component resolves the dynamic id.
// `to` is the encrypted-thread recipient hint (see StartEncryptedButton) so the
// encrypted composer can fan out to the peer without a participant lookup;
// `unread` is a contract-free hint from the inbox row for the NEW-messages
// divider (absent → no divider; superseded by the split-pane shell later).
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ to?: string; unread?: string }>;
}) {
  const { id } = await params;
  const { to, unread } = await searchParams;
  const parsedUnread = unread ? Number.parseInt(unread, 10) : NaN;
  const unreadCount = Number.isFinite(parsedUnread) && parsedUnread > 0 ? parsedUnread : undefined;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <ConversationView conversationId={id} recipientHint={to} unreadCount={unreadCount} />
      </div>
    </main>
  );
}
