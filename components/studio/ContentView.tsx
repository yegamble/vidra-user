"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { UploadIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { api } from "@/lib/api";
import type { VideoConfigResponse } from "@/lib/api";

import { MyVideosSection } from "./MyVideosSection";
import { UploadSection } from "./UploadSection";
import { useStudio } from "./StudioContext";

// ContentView is the Studio Content tab: the stepped upload sheet + the current
// channel's video list. Both are scoped to the studio's current channel via the
// shared context (the per-section channel <select>s are gone). A `?upload=1` deep
// link auto-opens the upload sheet (then the param is stripped via router.replace).
export function ContentView() {
  const { channels, currentHandle } = useStudio();
  const router = useRouter();
  const params = useSearchParams();
  const autoOpen = params.get("upload") === "1";
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);

  // The metadata taxonomy is static; load it once for the upload + edit forms.
  useEffect(() => {
    const controller = new AbortController();
    api.getVideoConfig(controller.signal).then(setConfig).catch(() => {});
    return () => controller.abort();
  }, []);

  const consumeAutoOpen = useCallback(() => {
    router.replace("/studio/content", { scroll: false });
  }, [router]);

  if (channels.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <EmptyState
          icon={<UploadIcon size={24} />}
          title="Create a channel to upload"
          message="Videos live on a channel. Create one to start publishing and importing."
        />
        <div className="flex justify-center">
          <LinkButton href="/studio/channel?create=1">Create a channel</LinkButton>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <UploadSection
        key={`upload-${currentHandle}`}
        channels={channels}
        config={config}
        defaultHandle={currentHandle}
        autoOpen={autoOpen}
        onAutoOpenConsumed={consumeAutoOpen}
      />
      <MyVideosSection handle={currentHandle} config={config} />
    </div>
  );
}
