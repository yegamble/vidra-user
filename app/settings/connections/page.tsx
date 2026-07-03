import { ConnectionsView } from "@/components/ConnectionsView";

export default function ConnectionsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Connected accounts</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Accounts on other networks that Vidra can post to on your behalf. Cross-posting is outbound
        only and happens automatically when you publish a public video.
      </p>
      <ConnectionsView />
    </main>
  );
}
