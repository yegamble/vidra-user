import { PageHeader } from "@/components/PageHeader";
import { MyReportsView } from "@/components/reports/MyReportsView";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

// "My reports": the abuse reports the signed-in user filed, with their state
// and the conversation with the moderators (core 0163).
export default function MyReportsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="My reports"
        description="Abuse reports you filed. Open one to see what happened and to message the moderators."
      />
      <MyReportsView />
    </main>
  );
}
