import { MessagesView } from "@/components/MessagesView";

export default function MessagesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Messages</h1>
      <MessagesView />
    </main>
  );
}
