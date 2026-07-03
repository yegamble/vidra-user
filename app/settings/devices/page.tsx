import { DevicesView } from "@/components/e2ee/DevicesView";

export default function DevicesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Encrypted-messaging devices</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Each device you use encrypted messaging on has its own keys. Compare a device&rsquo;s
          safety number with the other person out of band to verify no one is intercepting.
        </p>
      </div>
      <DevicesView />
    </main>
  );
}
