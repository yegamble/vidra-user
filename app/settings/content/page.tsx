import { ContentSettingsView } from "@/components/ContentSettingsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

// The "Sensitive content" account page: the per-user override of the instance
// sensitive_content_policy. Signed in only — the view handles the restoring /
// signed-out states itself.
export default function ContentSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Sensitive content"
        description={
          <>
            Control how videos flagged as sensitive are shown to you across this
            instance.
          </>
        }
      />
      <ContentSettingsView />
    </main>
  );
}
