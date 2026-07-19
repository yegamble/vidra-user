import { InboxTabs } from "@/components/InboxTabs";
import { NotificationsView } from "@/components/NotificationsView";

// The Inbox landing (the mobile "Inbox" tab target). On phones the InboxTabs
// segmented control switches to the Messages half; on desktop it is hidden and
// this is simply the full notifications list (reached from the header bell's
// "See all notifications").
export default function NotificationsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-4 text-title sm:mb-6 sm:text-large-title">Inbox</h1>
      <InboxTabs active="notifications" className="mb-5" />
      <NotificationsView />
    </main>
  );
}
