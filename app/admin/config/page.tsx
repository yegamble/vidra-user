import { AdminInstanceConfigView } from "@/components/AdminInstanceConfigView";
import { AdminTabs } from "@/components/AdminTabs";

export default function AdminConfigPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <AdminTabs />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Instance configuration</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Instance identity, registration, feature toggles, and moderation gates.
      </p>
      <AdminInstanceConfigView />
    </main>
  );
}
