import { AdminCommentsView } from "@/components/AdminCommentsView";

export default function AdminCommentsPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Comments</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Every comment on the instance. Delete any that violate the rules.
        </p>
      </header>
      <AdminCommentsView />
    </main>
  );
}
