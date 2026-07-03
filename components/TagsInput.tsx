"use client";

import { useId, useState } from "react";

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
      <span className="font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded border border-zinc-300 px-2 py-1.5 focus-within:ring-2 focus-within:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2 pr-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => remove(tag)}
              className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-3 w-3"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
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
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 focus:outline-none"
        />
      </div>
      <p id={hintId} role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
        {error ?? `Up to ${MAX_TAGS} tags — press Enter or comma to add.`}
      </p>
    </div>
  );
}
