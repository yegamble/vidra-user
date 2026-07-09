import { useEffect, useState } from "react";

import { getInstanceCached, type SensitiveContentPolicy } from "@/lib/api";

/**
 * useSensitiveContentPolicy resolves the instance's effective presentation
 * policy for sensitive videos (spec: instance-platform-info.md). Backed by the
 * module-level cached GET /instance, so a whole grid of VideoCards shares one
 * fetch. Returns null while unknown, on fetch failure, or while the backend
 * does not yet expose the field — which all mean "apply no client treatment"
 * (the default `hide` policy is enforced server-side, so an absent field never
 * needs blur/warn styling here).
 */
export function useSensitiveContentPolicy(): SensitiveContentPolicy | null {
  const [policy, setPolicy] = useState<SensitiveContentPolicy | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInstanceCached()
      .then((res) => {
        if (!cancelled) setPolicy(res.sensitive_content_policy ?? null);
      })
      .catch(() => {
        // No instance document — leave null (no client-side treatment).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return policy;
}
