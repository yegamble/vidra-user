import { SearchSettingsView } from "@/components/SearchSettingsView";

// The "Search & recommendations" account page (search-service W4): the per-user
// personalization/history toggles and the stored-search-history manager. Signed
// in only — the view handles the restoring / signed-out states itself.
export default function SearchSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Search &amp; recommendations</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Control how your searches and viewing shape suggestions, results, and
        recommendations — and review or clear your search history.
      </p>
      <SearchSettingsView />
    </main>
  );
}
