"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/auth/AuthProvider";
import { StudioProvider } from "@/components/studio/StudioContext";
import { StudioNav } from "@/components/studio/StudioNav";
import { EmptyState } from "@/components/ui/EmptyState";

// NavGate hides the studio nav in the single-video management mode
// (`/studio?video=<id>`, the moderator/owner deep link) so that surface reads as
// a focused full-page editor; every other studio route shows the tab strip.
function NavGate() {
  const pathname = usePathname();
  const params = useSearchParams();
  const managingVideo = pathname === "/studio" && Boolean(params.get("video"));
  if (managingVideo) return null;
  return <StudioNav />;
}

// StudioLayout is the client shell shared by every /studio surface: it renders
// the persistent "Studio" page title, session-gates the whole studio, and mounts
// the StudioProvider (which loads the caller's channels once) + the StudioNav
// above the active surface. The provider persists across tab navigation, so
// switching Dashboard → Content → Live never re-fetches the channel list.
export default function StudioLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();

  return (
    <PageShell className="overflow-x-clip py-8">
      <div className="w-full max-w-5xl">
        <h1 className="mb-6 text-title sm:text-large-title">Studio</h1>
        {status !== "authed" ? (
          <EmptyState
            title="Sign in to use the studio"
            message={
              <>
                <Link href="/login" className="underline hover:text-fg">
                  Sign in
                </Link>{" "}
                to create a channel and publish videos.
              </>
            }
          />
        ) : (
          <StudioProvider>
            <Suspense fallback={null}>
              <NavGate />
            </Suspense>
            {children}
          </StudioProvider>
        )}
      </div>
    </PageShell>
  );
}
