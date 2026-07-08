"use client";

import { useId, useState } from "react";

import { CloseIcon } from "@/components/icons";
import { MAX_TAGS, addTags } from "@/lib/tags";

// TagsInput is the free-form tags editor for the studio publish/edit forms:
// typed entries commit on Enter or comma (comma-separated paste works too),
// render as removable chips, and are lowercased/deduped/capped at 5 (mirroring
// the backend contract, so a valid form never 422s on tags). Backspace in the
// empty field removes the last chip. Limit violations surface as an inline
// role="status" hint rather than blocking the whole form.
export function TagsInput({
  value,
  onChange,
  label = "Tags",
  ariaLabel,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  /** Accessible name for the text field (e.g. "Video tags" / "Edit tags"). */
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();

  function commit(input: string) {
    if (input.trim() === "") return;
    const result = addTags(value, input);
    if (result.tags.length !== value.length) onChange(result.tags);
    setError(
      result.error === "too-many"
        ? `Up to ${MAX_TAGS} tags.`
        : result.error === "too-long"
          ? "Tags can be at most 50 characters."
          : null,
    );
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
    setError(null);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-fg">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pl-3 pr-1.5 text-xs font-semibold text-fg"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => remove(tag)}
              className="flex h-4 w-4 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg focus-ring"
            >
              <CloseIcon size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            // A typed/pasted comma commits everything before it immediately.
            if (e.target.value.includes(",")) commit(e.target.value);
            else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Never submit the surrounding form from the tags field.
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => commit(draft)}
          aria-label={ariaLabel}
          aria-describedby={hintId}
          placeholder={value.length === 0 ? "Add a tag and press Enter" : ""}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
      </div>
      <p id={hintId} role="status" className="text-xs text-fg-muted">
        {error ?? `Up to ${MAX_TAGS} tags — press Enter or comma to add.`}
      </p>
    </div>
  );
}
