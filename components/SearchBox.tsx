"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SearchIcon } from "@/components/icons";

// Header search box (design template: a quiet pill on the muted surface).
// Submitting navigates to /search?q=… (the results page reads the query from
// the URL). Uncontrolled-by-URL on purpose so it works in the always-present
// header without forcing dynamic rendering.
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      className="w-full max-w-md"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-surface-muted px-4 py-2 transition-colors focus-within:bg-surface-strong/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus">
        <SearchIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search videos, channels, tags"
          aria-label="Search videos"
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
    </form>
  );
}
