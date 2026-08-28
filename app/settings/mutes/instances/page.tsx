import { MutedInstancesView } from "@/components/MutedInstancesView";
import { MutesTabs } from "@/components/MutesTabs";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";
import { PageHeader } from "@/components/PageHeader";

export default function MutedInstancesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={<SettingsBackLink />}
        title="Muted instances"
        description="Federated instances you have muted. Their videos and comments are hidden from you."
      />
      <MutesTabs />
      <MutedInstancesView />
    </main>
  );
}
