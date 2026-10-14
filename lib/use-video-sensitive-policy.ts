"use client";

import type { SensitiveContentPolicy, SensitiveFlag } from "@/lib/api";
import { useContentPreferences } from "@/lib/content-preferences";
import { resolveSensitivePolicy } from "@/lib/sensitive-flags";
import { useSensitiveContentPolicy } from "@/lib/use-sensitive-policy";

/**
 * useVideoSensitivePolicy is the policy that applies to ONE video for the
 * current viewer: their base policy (useSensitiveContentPolicy) refined by
 * their per-flag overrides, the most restrictive flag winning. Grid tiles and
 * the watch gate read this instead of the base policy, so a viewer can blur
 * violence but display everything else. An unflagged video behaves exactly as
 * before (base policy). Kept apart from use-sensitive-policy so that module's
 * test mocks keep working.
 */
export function useVideoSensitivePolicy(video: {
  is_sensitive?: boolean;
  sensitive_flags?: SensitiveFlag[];
}): SensitiveContentPolicy | null {
  const base = useSensitiveContentPolicy();
  const prefs = useContentPreferences();
  return resolveSensitivePolicy(base, prefs.sensitive_flag_policies, video);
}
