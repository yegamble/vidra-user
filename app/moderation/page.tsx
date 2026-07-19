import { ModerationQueue } from "@/components/ModerationQueue";

export default function ModerationPage() {
  return (
    <main className="min-w-0 flex-1">
      <header className="mb-5">
        <h1 className="text-title sm:text-large-title">Reports</h1>
        <p className="mt-1 text-subhead text-fg-muted">
          Review and resolve abuse reports filed by viewers.
        </p>
      </header>
      <ModerationQueue />
    </main>
  );
}
