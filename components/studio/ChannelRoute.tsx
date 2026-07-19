"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChannelManageView } from "./ChannelManage";

// ChannelRoute is the client entry for `/studio/channel`. A `?create=1` deep link
// opens the create-channel dialog (then the param is stripped via router.replace).
export function ChannelRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const autoCreate = params.get("create") === "1";

  const consumeAutoCreate = useCallback(() => {
    router.replace("/studio/channel", { scroll: false });
  }, [router]);

  return <ChannelManageView autoCreate={autoCreate} onAutoCreateConsumed={consumeAutoCreate} />;
}
