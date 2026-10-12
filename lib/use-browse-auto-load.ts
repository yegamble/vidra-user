"use client";

import { resolveBrowseScrollMode } from "@/lib/feed-defaults";
import { useInstanceDefaults } from "@/lib/instance-defaults";

/**
 * Whether the operator turned infinite scroll on (`browse_scroll_mode`), for a
 * "Load more" list's `ListTail`. One definition so each list surface does not
 * restate the instance-defaults lookup; absent or unrecognised means the
 * manual button, today's behaviour.
 */
export function useBrowseAutoLoad(): boolean {
  return resolveBrowseScrollMode(useInstanceDefaults()) === "auto";
}
