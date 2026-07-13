"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { ClockIcon, CloseIcon, HashIcon, SearchIcon, UserIcon, VideoIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { SearchSuggestion } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { trackSearchEvent } from "@/lib/search-events";
import { searchHref, type SearchFilters } from "@/lib/search-url";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const DEBOUNCE_MS = 200;
const SUGGESTION_LIMIT = 8;
const CACHE_MAX = 20;

export type SearchAutocompleteVariant = "header" | "field";

export interface SearchAutocompleteProps {
  /** Accessible name for the wrapping role="search" landmark. Keep the header
   *  and page landmarks distinct so they remain unique. */
  landmarkLabel: string;
  /** Seed for the input; re-seeded when it changes (a deep link / clear). */
  initialQuery?: string;
  /** Active taxonomy/tag filters, threaded onto query/tag navigations. */
  filters?: SearchFilters;
  /** When false, suggestions never fetch (the instance toggle is off / the
   *  service is unwired). The plain input still submits searches. */
  suggestionsEnabled?: boolean;
  /** Visual treatment: the header pill or the results-page field. */
  variant?: SearchAutocompleteVariant;
  /** Navigate to /search on an empty submit (the field clears the results);
   *  the header does nothing on an empty submit. */
  submitEmpty?: boolean;
  autoFocus?: boolean;
}

/** A tiny insertion-ordered LRU: on hit we re-insert to mark recent; on
 *  overflow we drop the oldest key. Scoped per component instance (per session,
 *  since the widget lives for the tab). */
function cacheGet(
  cache: Map<string, SearchSuggestion[]>,
  key: string,
): SearchSuggestion[] | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(
  cache: Map<string, SearchSuggestion[]>,
  key: string,
  value: SearchSuggestion[],
): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Bold the first case-insensitive occurrence of the typed prefix inside a
 *  suggestion's text. The full text stays as the element's textContent, so a
 *  screen reader announces the whole label — the <strong> is a visual accent
 *  only. */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <strong className="font-semibold text-fg">{match}</strong>
      {after}
    </>
  );
}

function suggestionIcon(type: string): ReactNode {
  switch (type) {
    case "history":
      return <ClockIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    case "video":
      return <VideoIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    case "channel":
      return <UserIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    case "tag":
      return <HashIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    default:
      return <SearchIcon size={16} strokeWidth={2} className="shrink-0 text-fg-muted" />;
  }
}

/**
 * SearchAutocomplete — the accessible search combobox (WAI-ARIA 1.2
 * combobox-with-listbox pattern, forked from Dropdown's keyboard/placement
 * scaffold): the input is role="combobox" (aria-expanded / aria-controls /
 * aria-activedescendant / aria-autocomplete="list"); the popup is role="listbox"
 * with role="option" children. Suggestions are fetched from the search service,
 * 200ms-debounced, IME-safe (no fetch mid-composition), stale-response-cancelled
 * (AbortController + a monotonic request id), and prefix-cached (LRU 20). The
 * popup is an absolute overlay so loading / empty / degraded states never shift
 * layout — they are simply silent. History rows carry a clock icon, an optional
 * "from your history" mark, and an aria-hidden × remove button (Delete on the
 * active option is the keyboard affordance, keeping the combobox's focus model
 * intact).
 */
export function SearchAutocomplete({
  landmarkLabel,
  initialQuery = "",
  filters = {},
  suggestionsEnabled = true,
  variant = "header",
  submitEmpty = false,
  autoFocus = false,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [value, setValue] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [flipUp, setFlipUp] = useState(false);
  // IME composition is state (not a ref) so the fetch effect can depend on it:
  // typing mid-composition never fetches, and composition-END flips this false,
  // re-running the effect to fetch for the finished text.
  const [composing, setComposing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const cacheRef = useRef<Map<string, SearchSuggestion[]>>(new Map());
  const seqRef = useRef(0);
  const focusedRef = useRef(false);
  const shownForRef = useRef<string | null>(null);

  // Re-seed the editable draft when the committed query prop changes (deep link,
  // header submit, the clear button navigating to a blank query). Done during
  // render — not in an effect — to avoid a cascading re-render.
  const [committed, setCommitted] = useState(initialQuery);
  if (initialQuery !== committed) {
    setCommitted(initialQuery);
    setValue(initialQuery);
  }

  const debounced = useDebouncedValue(value, DEBOUNCE_MS);

  const closePopup = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // Publish a resolved suggestion set: open only while focused with results,
  // announce the count for screen readers, and emit suggestions_shown once per
  // distinct prefix actually shown. Called only from async callbacks (never
  // synchronously in an effect body).
  const applyResults = useCallback((prefix: string, list: SearchSuggestion[]) => {
    setSuggestions(list);
    setActiveIndex(-1);
    const shouldOpen = focusedRef.current && list.length > 0;
    setOpen(shouldOpen);
    if (shouldOpen) {
      setLiveMessage(
        list.length === 1
          ? t("search.suggestionsOne")
          : t("search.suggestionsMany", { count: list.length }),
      );
      if (shownForRef.current !== prefix) {
        shownForRef.current = prefix;
        trackSearchEvent({ type: "search.suggestions_shown", query: prefix, count: list.length });
      }
    } else {
      setLiveMessage("");
      shownForRef.current = null;
    }
  }, []);

  // Fetch suggestions for the debounced prefix. Guards: suggestions disabled,
  // mid-IME-composition, or an empty prefix. A cache hit resolves without a
  // request. Every path carries a monotonic id so an out-of-order / superseded
  // response is discarded, and all state writes happen in async callbacks.
  useEffect(() => {
    if (suggestionsEnabled === false) return;
    if (composing) return;
    const prefix = debounced.trim();
    const seq = ++seqRef.current;

    if (prefix.length < 1) {
      shownForRef.current = null;
      Promise.resolve().then(() => {
        if (seq !== seqRef.current) return;
        setSuggestions([]);
        closePopup();
      });
      return;
    }

    const cached = cacheGet(cacheRef.current, prefix);
    if (cached) {
      Promise.resolve().then(() => {
        if (seq !== seqRef.current) return;
        applyResults(prefix, cached);
      });
      return;
    }

    const controller = new AbortController();
    api
      .getSearchSuggestions(prefix, { limit: SUGGESTION_LIMIT }, controller.signal)
      .then((res) => {
        if (seq !== seqRef.current) return; // a newer request superseded this one
        const list = res.suggestions ?? [];
        cacheSet(cacheRef.current, prefix, list);
        applyResults(prefix, list);
      })
      .catch(() => {
        // Degraded / aborted: stay silent — never surface an error in a search
        // box, and don't churn the popup open/closed.
      });
    return () => controller.abort();
  }, [debounced, suggestionsEnabled, composing, applyResults, closePopup]);

  // Viewport-aware flip: if the popup can't fit below the input and there is more
  // room above, render it upward (measured pre-paint on open, like Dropdown).
  useLayoutEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    const list = listRef.current;
    if (!input || !list) return;
    const rect = input.getBoundingClientRect();
    const listH = list.offsetHeight;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    setFlipUp(spaceBelow < listH && spaceAbove > spaceBelow);
  }, [open, suggestions.length]);

  // Keep the active option scrolled into view during keyboard navigation.
  useEffect(() => {
    if (activeIndex < 0) return;
    // Optional-call guard: jsdom (and some embedded webviews) lack scrollIntoView.
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function navigateToQuery(text: string) {
    setValue(text);
    router.push(searchHref(text.trim(), filters));
  }

  function selectSuggestion(s: SearchSuggestion, index: number) {
    trackSearchEvent({
      type: "search.suggestion_selected",
      query: debounced.trim(),
      suggestion: s.text,
      suggestion_type: s.type,
      position: index,
    });
    closePopup();
    switch (s.type) {
      case "video":
        if (s.video_id) {
          router.push(`/videos/${encodeURIComponent(s.video_id)}`);
          return;
        }
        navigateToQuery(s.text);
        return;
      case "channel":
        if (s.channel_handle) {
          router.push(`/channels/${encodeURIComponent(s.channel_handle)}`);
          return;
        }
        navigateToQuery(s.text);
        return;
      case "tag":
        setValue(s.text);
        router.push(searchHref("", { ...filters, tag: s.text }));
        return;
      case "query":
      case "history":
      default:
        navigateToQuery(s.text);
        return;
    }
  }

  function submitRaw() {
    const q = value.trim();
    closePopup();
    if (!q && !submitEmpty) return;
    // search.submitted is emitted by SearchResults when the results page loads,
    // so it is not double-counted here — this only navigates.
    router.push(searchHref(q, filters));
  }

  function removeHistoryItem(index: number) {
    const s = suggestions[index];
    if (!s || s.type !== "history") return;
    const next = suggestions.filter((_, i) => i !== index);
    setSuggestions(next);
    // Keep the LRU cache for this prefix in sync so re-typing doesn't resurrect it.
    const key = debounced.trim();
    if (key) cacheSet(cacheRef.current, key, next);
    setActiveIndex((prev) => {
      if (prev < 0) return prev;
      if (index < prev) return prev - 1;
      if (index === prev) return Math.min(prev, next.length - 1);
      return prev;
    });
    if (next.length === 0) closePopup();
    // Best-effort delete; optimistic removal stands even if the call fails.
    void api.deleteSearchHistoryEntry(s.text).catch(() => {});
    // The × lives outside the combobox focus model — keep focus on the input.
    inputRef.current?.focus();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    // Never treat keys as combobox navigation mid-IME-composition (an Enter that
    // confirms a candidate must not submit / select).
    if (composing || e.nativeEvent.isComposing) return;
    const last = suggestions.length - 1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open && suggestions.length > 0) {
          setOpen(true);
          setActiveIndex(0);
        } else if (open) {
          setActiveIndex((i) => (i >= last ? 0 : i + 1));
        }
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open && suggestions.length > 0) {
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
        if (open && activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          selectSuggestion(suggestions[activeIndex], activeIndex);
        }
        // Otherwise let the form's onSubmit run (submitRaw).
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          closePopup();
        } else if (value !== "") {
          // Second Escape (popup already closed) clears the field.
          e.preventDefault();
          setValue("");
        }
        return;
      case "Tab":
        // Let focus leave; just dismiss the popup.
        closePopup();
        return;
      case "Delete":
        if (open && activeIndex >= 0 && suggestions[activeIndex]?.type === "history") {
          e.preventDefault();
          removeHistoryItem(activeIndex);
        }
        return;
      default:
        return;
    }
  }

  const isField = variant === "field";
  const showPopup = open && suggestions.length > 0 && debounced.trim().length >= 1;

  return (
    <form
      ref={rootRef}
      role="search"
      aria-label={landmarkLabel}
      className={cn("relative", isField ? "w-full" : "w-full max-w-md")}
      onSubmit={(e) => {
        e.preventDefault();
        submitRaw();
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 bg-surface-muted transition-colors focus-within:bg-surface-strong/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
          isField ? "rounded-xl px-3.5 py-2.5" : "min-h-11 rounded-full px-4 py-2",
        )}
      >
        <SearchIcon
          size={isField ? 17 : 16}
          strokeWidth={2}
          className="shrink-0 text-fg-muted"
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          role="combobox"
          aria-expanded={showPopup}
          aria-controls={listboxId}
          aria-activedescendant={showPopup && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label={t("search.inputLabel")}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          placeholder={t("search.placeholder")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focusedRef.current = true;
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
            closePopup();
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          className={cn(
            "w-full bg-transparent text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:appearance-none",
            isField ? "text-[15px]" : "text-sm",
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              closePopup();
              inputRef.current?.focus();
              if (submitEmpty && committed) router.push(searchHref("", filters));
            }}
            aria-label={t("search.clear")}
            className="focus-ring -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg"
          >
            <CloseIcon size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {/* SR-only live region: announces the suggestion count without stealing
          focus or moving the popup. */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={t("search.suggestionsLabel")}
        hidden={!showPopup}
        className={cn(
          "absolute left-0 right-0 z-50 max-h-[min(60vh,360px)] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-raised p-1.5 shadow-lg",
          flipUp ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {suggestions.map((s, index) => {
          const active = index === activeIndex;
          const isHistory = s.type === "history";
          return (
            <li
              key={`${s.type}-${s.text}-${index}`}
              id={optionId(index)}
              role="option"
              aria-selected={active}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              // Keep the input focused (activedescendant model): prevent the
              // mousedown from blurring it, then handle selection on click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s, index)}
              onMouseMove={() => setActiveIndex(index)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm",
                active ? "bg-surface-muted" : "bg-transparent",
              )}
            >
              {suggestionIcon(s.type)}
              <span className="min-w-0 flex-1 truncate text-fg-muted">
                {highlightMatch(s.text, debounced)}
              </span>
              {isHistory && s.is_personal ? (
                <span className="shrink-0 text-[11px] font-medium text-fg-muted">
                  {t("search.personalBadge")}
                </span>
              ) : null}
              {isHistory ? (
                <button
                  type="button"
                  // Outside the combobox aria flow: the option itself is the
                  // interactive target for AT; this is a mouse convenience whose
                  // keyboard equivalent is Delete on the active option. Native
                  // title tooltip for sighted mouse users (aria-hidden from AT).
                  aria-hidden
                  tabIndex={-1}
                  title={t("search.removeHistory", { query: s.text })}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeHistoryItem(index);
                  }}
                  className="focus-ring -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                >
                  <CloseIcon size={14} strokeWidth={2} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </form>
  );
}
