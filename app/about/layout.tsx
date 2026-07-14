import { PageShell } from "@/components/PageShell";
import { InstanceAboutProvider } from "@/components/InstanceAboutProvider";
import {
  getInstanceAboutDocument,
  getInstanceAboutInstance,
} from "@/lib/instance-about.server";

export default async function AboutLayout({ children }: { children: React.ReactNode }) {
  const [instance, about] = await Promise.all([
    getInstanceAboutInstance(),
    getInstanceAboutDocument(),
  ]);

  return (
    <PageShell className="py-8 sm:py-10">
      <InstanceAboutProvider instance={instance} about={about}>
        {children}
      </InstanceAboutProvider>
    </PageShell>
  );
}
