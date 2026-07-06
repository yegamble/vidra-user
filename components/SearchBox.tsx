"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-4 w-4 shrink-0 text-fg-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4-4" />
        </svg>
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
