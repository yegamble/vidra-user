import { PageShell } from "@/components/PageShell";
import { StudioView } from "@/components/StudioView";
import { LinkButton } from "@/components/ui/LinkButton";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ video?: string | string[] }>;
}) {
  const requested = (await searchParams).video;
  const managedVideoId = typeof requested === "string" && requested !== "" ? requested : undefined;
  return (
    <PageShell className="overflow-x-clip py-8">
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-title sm:text-large-title">Studio</h1>
          <LinkButton href="/studio/stats" variant="tonal" size="sm">
            Creator stats
          </LinkButton>
        </div>
        <StudioView managedVideoId={managedVideoId} />
      </div>
    </PageShell>
  );
}
