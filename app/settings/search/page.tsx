import { SearchSettingsView } from "@/components/SearchSettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";
import { getInstanceConfig } from "@/lib/instance-config.server";

// The "Search & recommendations" account page (search-service W4): the per-user
// personalization/history toggles and the stored-search-history manager. Signed
// in only — the view handles the restoring / signed-out states itself.
//
// The SSR snapshot's search{} block is threaded down the same way app/search/page.tsx
// feeds SearchResults. Every preference here is only HALF a gate — core ANDs it
// with an operator setting — so without this block the page shows three toggles
// that can silently do nothing. Absent (older backend / failed fetch) means
// "not gated", matching every other consumer of this block.
export default async function SearchSettingsPage() {
  const search = (await getInstanceConfig())?.search;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Search & recommendations"
        description={
          <>
            Control how your searches and viewing shape suggestions, results, and
            recommendations — and review or clear your search history.
          </>
        }
      />
      <SearchSettingsView instanceSearch={search} />
    </main>
  );
}
