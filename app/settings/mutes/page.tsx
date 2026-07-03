import { MutedAccountsView } from "@/components/MutedAccountsView";
import { MutesTabs } from "@/components/MutesTabs";

export default function MutedAccountsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Muted accounts</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Accounts you have muted. Their comments are hidden from you.
      </p>
      <MutesTabs />
      <MutedAccountsView />
    </main>
  );
}
