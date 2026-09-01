import { PageHeader } from "@/components/PageHeader";
import { SuggestionBansView } from "@/components/SuggestionBansView";

export default function AutosuggestBansPage() {
  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title="Autosuggest"
        description="Queries suppressed from instance-wide search suggestions. Bans are global — nothing here is per-viewer."
      />
      <SuggestionBansView />
    </main>
  );
}
