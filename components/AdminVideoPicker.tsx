"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { api, videoThumbnailUrl } from "@/lib/api";
import type { AdminVideo } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/use-debounced-value";

// AdminVideoPicker is the `video-picker` control (spec: WAVE C4) behind the
// featured-banner "Featured video" setting. It is a debounced combobox over this
// instance's admin video list (api.getAdminVideos) — search rows carry a
// thumbnail, title, and channel; selecting one stores the video UUID and swaps
// the box for a compact preview card (thumbnail + title + Clear). It follows the
// WAI-ARIA combobox-with-listbox pattern used by SearchAutocomplete: an
// activedescendant model with arrow/Enter/Escape/Home/End keys, so the input
// keeps focus while the highlight moves.
//
// A stored UUID (initial load or an external draft change) is hydrated back into
// a preview via api.getVideo; a pick that cannot be read still shows a minimal
// card so the admin can always clear it.

const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 8;

type Selected = {
  id: string;
  title: string;
  channel: string;
  hasThumbnail: boolean;
};

/** A 16:9 poster with a graceful placeholder when there is no thumbnail (or it 404s). */
function Thumb({
  id,
  hasThumbnail,
  className,
}: {
  id: string;
  hasThumbnail: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!hasThumbnail || broken) {
    return <div aria-hidden className={cn("media-placeholder", className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- backend-served poster, not a static asset
    <img
      src={videoThumbnailUrl(id)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={cn("bg-surface-muted object-cover", className)}
    />
  );
}

export function AdminVideoPicker({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
}) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<AdminVideo[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const focusedRef = useRef(false);
  const seqRef = useRef(0);

  const debounced = useDebouncedValue(query, DEBOUNCE_MS);

  // Hydrate the preview from a stored UUID (initial load, reset, or an external
  // draft change). Best-effort: a pick we cannot read still shows a minimal card.
  // State writes are deferred to a microtask / async callback so the effect body
  // never sets state synchronously (cascading-render lint; SearchAutocomplete
  // uses the same Promise.resolve().then pattern).
  useEffect(() => {
    if (selected?.id === value) return;
    let cancelled = false;
    if (value === "") {
      if (selected !== null) {
        Promise.resolve().then(() => {
          if (!cancelled) setSelected(null);
        });
      }
      return () => {
        cancelled = true;
      };
    }
    api
      .getVideo(value)
      .then((v) => {
        if (cancelled) return;
        setSelected({
          id: v.id,
          title: v.title ?? "",
          channel: v.channel_display_name || v.channel_handle || "",
          hasThumbnail: v.has_thumbnail === true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSelected({ id: value, title: "", channel: "", hasThumbnail: true });
      });
    return () => {
      cancelled = true;
    };
  }, [value, selected]);

  // Fetch admin videos for the debounced query. Skipped while a pick is shown
  // (the search box is hidden then). A monotonic id discards superseded responses.
  useEffect(() => {
    if (selected) return;
    const q = debounced.trim();
    const seq = ++seqRef.current;
    if (q.length < 1) {
      // Deferred so the effect body never writes state synchronously.
      Promise.resolve().then(() => {
        if (seq !== seqRef.current) return;
        setResults([]);
        setOpen(false);
        setActiveIndex(-1);
      });
      return;
    }
    const controller = new AbortController();
    api
      .getAdminVideos({ q, limit: RESULT_LIMIT }, controller.signal)
      .then((res) => {
        if (seq !== seqRef.current) return;
        const list = res.videos ?? [];
        setResults(list);
        setActiveIndex(-1);
        setOpen(focusedRef.current && list.length > 0);
      })
      .catch(() => {
        // Degraded / aborted: keep the box quiet (never surface an error here).
      });
    return () => controller.abort();
  }, [debounced, selected]);

  // Keep the active option scrolled into view during keyboard navigation.
  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function choose(v: AdminVideo) {
    setSelected({
      id: v.id,
      title: v.title,
      channel: v.channel_display_name || v.channel_handle || "",
      hasThumbnail: v.has_thumbnail === true,
    });
    onChange(v.id);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function clear() {
    setSelected(null);
    onChange("");
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    // Return focus to the (now-visible) search input.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const last = results.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open && results.length > 0) {
          setOpen(true);
          setActiveIndex(0);
        } else if (open) {
          setActiveIndex((i) => (i >= last ? 0 : i + 1));
        }
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open && results.length > 0) {
          setOpen(true);
          setActiveIndex(last);
        } else if (open) {
          setActiveIndex((i) => (i <= 0 ? last : i - 1));
        }
        return;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        return;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(last);
        }
        return;
      case "Enter":
        if (open && activeIndex >= 0 && results[activeIndex]) {
          e.preventDefault();
          choose(results[activeIndex]);
        }
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
  }

  // A stored pick: the compact preview card (thumbnail + title + Clear).
  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <div
          data-testid="featured-video-preview"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2"
        >
          <Thumb
            id={selected.id}
            hasThumbnail={selected.hasThumbnail}
            className="h-12 w-[5.33rem] shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">
              {selected.title || "Selected video"}
            </p>
            {selected.channel ? (
              <p className="truncate text-xs text-fg-muted">{selected.channel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={`Clear ${label}`}
            className="focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-60"
          >
            Clear
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  // No pick: the debounced search combobox.
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder="Search your videos…"
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focusedRef.current = true;
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
            setOpen(false);
            setActiveIndex(-1);
          }}
          className="focus-ring w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted disabled:opacity-60"
        />
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          hidden={!open}
          className="scrollbar-none absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1.5 shadow-soft-strong"
        >
          {results.map((v, index) => {
            const active = index === activeIndex;
            const channel = v.channel_display_name || v.channel_handle || "";
            return (
              <li
                key={v.id}
                id={optionId(index)}
                role="option"
                aria-selected={active}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                // Keep the input focused (activedescendant model): prevent the
                // mousedown blur, then select on click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(v)}
                onMouseMove={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg p-1.5",
                  active ? "bg-surface-muted" : "bg-transparent",
                )}
              >
                <Thumb
                  id={v.id}
                  hasThumbnail={v.has_thumbnail === true}
                  className="h-10 w-[4.44rem] shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{v.title}</p>
                  {channel ? <p className="truncate text-xs text-fg-muted">{channel}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
