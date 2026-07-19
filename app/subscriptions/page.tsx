import { PageShell } from "@/components/PageShell";
import { SubscriptionsView } from "@/components/SubscriptionsView";

export default function SubscriptionsPage() {
  return (
    <PageShell className="py-8">
      <h1 className="mb-6 text-title sm:text-large-title">Subscriptions</h1>
      <SubscriptionsView />
    </PageShell>
  );
}
