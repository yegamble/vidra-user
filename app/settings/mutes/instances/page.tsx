import { MutedInstancesView } from "@/components/MutedInstancesView";
import { MutesTabs } from "@/components/MutesTabs";

export default function MutedInstancesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Muted instances</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Federated instances you have muted. Their videos and comments are hidden from you.
      </p>
      <MutesTabs />
      <MutedInstancesView />
    </main>
  );
}
