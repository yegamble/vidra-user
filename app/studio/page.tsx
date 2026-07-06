import { StudioView } from "@/components/StudioView";
import { LinkButton } from "@/components/ui/LinkButton";

export default function StudioPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-x-clip px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Studio</h1>
        <LinkButton href="/studio/stats" variant="secondary" size="sm">
          Creator stats
        </LinkButton>
      </div>
      <StudioView />
    </main>
  );
}
