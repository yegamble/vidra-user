// Pure helpers for the free-form tags editor (unit-tested; the DOM lives in
// components/TagsInput.tsx). Mirrors the backend's rules: lowercased, trimmed,
// deduped, at most 5 distinct tags of at most 50 characters each.

export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 50;

/** normalizeTag lowercases and trims a raw entry, mirroring the backend. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface AddTagsResult {
  /** The resulting tag list (unchanged entries first, additions appended). */
  tags: string[];
  /** Why (some) input was not added; null when everything fit. */
  error: "too-many" | "too-long" | null;
}

/**
 * addTags commits raw input to a tag list: splits on commas (paste-friendly),
 * normalizes each entry, drops empties and duplicates, and enforces the length
 * and count limits. Valid entries before an offending one are still added.
 */
export function addTags(tags: string[], input: string): AddTagsResult {
  const next = [...tags];
  let error: AddTagsResult["error"] = null;
  for (const part of input.split(",")) {
    const tag = normalizeTag(part);
    if (tag === "" || next.includes(tag)) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      error = "too-long";
      continue;
    }
    if (next.length >= MAX_TAGS) {
      error = "too-many";
      continue;
    }
    next.push(tag);
  }
  return { tags: next, error };
}
