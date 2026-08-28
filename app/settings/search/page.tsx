import { SearchSettingsView } from "@/components/SearchSettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

// The "Search & recommendations" account page (search-service W4): the per-user
// personalization/history toggles and the stored-search-history manager. Signed
// in only — the view handles the restoring / signed-out states itself.
export default function SearchSettingsPage() {
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
      <SearchSettingsView />
    </main>
  );
}
