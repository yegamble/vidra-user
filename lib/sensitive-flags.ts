import type { SensitiveContentPolicy, SensitiveFlag } from "@/lib/api";

/** The creator-facing flag kinds, in display order (vidra-core video.SensitiveFlags). */
export const SENSITIVE_FLAGS: ReadonlyArray<{ value: SensitiveFlag; label: string; hint: string }> = [
  { value: "violent", label: "Violent or graphic", hint: "Injury, gore or real violence." },
  { value: "shocking", label: "Shocking or disturbing", hint: "Content many viewers would find upsetting." },
  { value: "sex", label: "Sexual content", hint: "Nudity or explicit sexual material." },
];

export type SensitiveFlagPolicies = Partial<Record<SensitiveFlag, SensitiveContentPolicy>>;

// Restrictiveness order: a later entry wins when several flags apply.
const RANK: Record<SensitiveContentPolicy, number> = { display: 0, blur: 1, warn: 2, hide: 3 };

/**
 * resolveSensitivePolicy is the policy one viewer's settings give one video:
 * the MOST RESTRICTIVE of the viewer's policy for each flag the video carries
 * (their override, else `base`), or `base` for a sensitive video with no flags.
 * Not sensitive -> "display". Mirrors vidra-core video.ResolveSensitivePolicy;
 * core enforces only "hide" (server-side), this decides blur/warn presentation.
 * `base` null (still unknown) means "no client treatment", as everywhere else.
 */
export function resolveSensitivePolicy(
  base: SensitiveContentPolicy | null,
  overrides: SensitiveFlagPolicies,
  video: { is_sensitive?: boolean; sensitive_flags?: SensitiveFlag[] },
): SensitiveContentPolicy | null {
  if (video.is_sensitive !== true) return "display";
  const flags = video.sensitive_flags ?? [];
  if (flags.length === 0) return base;
  let best: SensitiveContentPolicy | null = null;
  for (const f of flags) {
    const p = overrides[f] ?? base;
    if (p && (best === null || RANK[p] > RANK[best])) best = p;
  }
  return best;
}
