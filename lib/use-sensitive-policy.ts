import { useEffect, useState } from "react";

import { useOptionalSession } from "@/components/auth/AuthProvider";
import { getInstanceCached, type SensitiveContentPolicy } from "@/lib/api";

/**
 * useInstanceSensitivePolicy resolves the INSTANCE's presentation policy for
 * sensitive videos (spec: instance-platform-info.md). Backed by the module-level
 * cached GET /instance, so a whole grid of VideoCards shares one fetch. Returns
 * null while unknown, on fetch failure, or while the backend does not yet expose
 * the field — all of which mean "apply no client treatment".
 *
 * This is the raw instance value only (no per-user override). The viewer setting
 * page uses it to label its "Use instance default (…)" option; presentation
 * consumers should use useSensitiveContentPolicy() instead, which layers the
 * per-user override on top.
 */
export function useInstanceSensitivePolicy(): SensitiveContentPolicy | null {
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

/**
 * useSensitiveContentPolicy resolves the EFFECTIVE presentation policy for the
 * current viewer: a signed-in user's per-account `sensitive_content_policy`
 * override (from the session, GET /auth/me) when set, otherwise the instance
 * policy. Every card/feed/watch consumer reads this one hook, so per-user
 * granularity applies everywhere with no per-component change.
 *
 * SSR/hydration safety is preserved: on the server (and the first client render,
 * before the session restore + /instance fetch settle) both inputs are null, so
 * this returns null — "apply no client treatment" — and only narrows to a real
 * policy after hydration, exactly like the instance fetch did before.
 *
 * Only `hide` is server-enforced (flagged videos drop out of the viewer's
 * feed/search); warn/blur/display are presentation applied here.
 */
export function useSensitiveContentPolicy(): SensitiveContentPolicy | null {
  const instancePolicy = useInstanceSensitivePolicy();
  const session = useOptionalSession();
  // A blank/unset override (null/undefined) inherits the instance policy.
  const userPolicy = session?.user?.sensitive_content_policy ?? null;
  return userPolicy ?? instancePolicy;
}
