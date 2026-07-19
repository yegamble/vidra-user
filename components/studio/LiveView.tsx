"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LiveStreamsSection } from "@/components/LiveStreamsSection";
import { TvIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";

import { useStudio } from "./StudioContext";

// LiveView is the Studio Live tab: the current channel's live streams + the
// create-live Modal. Scoped to the studio's current channel via context. A
// `?new=1` deep link opens the create-live form (then the param is stripped).
export function LiveView() {
  const { channels, currentHandle } = useStudio();
  const router = useRouter();
  const params = useSearchParams();
  const autoOpen = params.get("new") === "1";

  const consumeAutoOpen = useCallback(() => {
    router.replace("/studio/live", { scroll: false });
  }, [router]);

  if (channels.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <EmptyState
          icon={<TvIcon size={24} />}
          title="Create a channel to go live"
          message="Live streams belong to a channel. Create one to get a stream key."
        />
        <div className="flex justify-center">
          <LinkButton href="/studio/channel?create=1">Create a channel</LinkButton>
        </div>
      </section>
    );
  }

  return (
    <LiveStreamsSection
      key={currentHandle}
      handle={currentHandle}
      autoOpen={autoOpen}
      onAutoOpenConsumed={consumeAutoOpen}
    />
  );
}
