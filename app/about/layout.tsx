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
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <InstanceAboutProvider instance={instance} about={about}>
        {children}
      </InstanceAboutProvider>
    </main>
  );
}
