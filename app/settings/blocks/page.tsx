import { BlockedUsersView } from "@/components/BlockedUsersView";

export default function BlockedUsersPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Blocked accounts</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Accounts you have blocked. Neither of you can send the other a direct message.
      </p>
      <BlockedUsersView />
    </main>
  );
}
