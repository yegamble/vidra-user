"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ChevronLeftIcon, ClockIcon, CloseIcon, HashIcon, SearchIcon, UserIcon, VideoIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { SearchSuggestion } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { trackSearchEvent } from "@/lib/search-events";
import {
  readSearchFilters,
  readSearchType,
  searchHref,
  type SearchFilters,
} from "@/lib/search-url";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const DEBOUNCE_MS = 200;
const SUGGESTION_LIMIT = 8;
const CACHE_MAX = 20;

// Focusables the mobile sheet's Tab trap cycles between (mirrors ui/Modal).
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Display grouping order (YouTube-flat then realestate-grouped): queries and
// personal history share the flat top block (0); videos, channels, and tags each
// form their own titled group below a hairline. A stable sort keeps the search
// service's blend/slot-reservation ordering within each bucket.
const TYPE_ORDER: Record<string, number> = { query: 0, history: 0, video: 1, channel: 2, tag: 3 };

/** A tiny insertion-ordered LRU: on hit we re-insert to mark recent; on
 *  overflow we drop the oldest key. Scoped per component instance. */
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

/** Order a fetched suggestion set into display order (query+history first, then
 *  video/channel/tag groups). Array.prototype.sort is stable, so the service's
 *  ordering within each bucket is preserved. */
function orderSuggestions(list: SearchSuggestion[]): SearchSuggestion[] {
  return [...list].sort((a, b) => (TYPE_ORDER[a.type] ?? 0) - (TYPE_ORDER[b.type] ?? 0));
}

/** Bold the first case-insensitive occurrence of the typed prefix (realestate
 *  style — bold what was typed, regular completion). The full text stays the
 *  element's textContent so a screen reader announces the whole label; the
 *  <strong> is a visual accent only. */
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
      return <ClockIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    case "video":
      return <VideoIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    case "channel":
      return <UserIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    case "tag":
      return <HashIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />;
    default:
      return <SearchIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />;
  }
}

// Elements where a bare "/" is a character the user is typing, not the
// focus-search command. `closest` also covers a click target nested inside a
// contenteditable region.
const EDITABLE =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"])';

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false;
  return target.closest(EDITABLE) !== null;
}

function groupLabel(bucket: number): string {
  if (bucket === 1) return t("search.groupVideos");
  if (bucket === 2) return t("search.groupChannels");
  return t("search.groupTags");
}

function typeLabel(type: string): string | null {
  if (type === "video") return t("search.typeVideo");
  if (type === "channel") return t("search.typeChannel");
  if (type === "tag") return t("search.typeTag");
  return null;
}

// ── Shared combobox engine ──────────────────────────────────────────────────
// One hook drives one combobox surface. The header pill and the mobile sheet
// each own a private instance (they are never used at the same time), which
// keeps the ARIA ids, refs, and fetch lifecycle cleanly separated. The hook
// reads the current route: on /search it reflects the URL's `q` (re-seeding the
// draft when the query changes) and threads the active filters onto every
// navigation, so the single header box IS the results-page search.

type ComboboxRefs = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLUListElement | null>;
  optionRefs: React.RefObject<(HTMLLIElement | null)[]>;
};

type Combobox = ReturnType<typeof useSearchCombobox>;

// The refs live in the rendering surface (created with useRef there) and are
// threaded in, so the hook returns only render values + callbacks — never ref
// objects. Returning refs from a hook and reading them in another component's
// render trips the React Compiler's ref rules; this keeps the render pure.
function useSearchCombobox({
  suggestionsEnabled,
  onCommit,
  escapeBlurs = false,
  inputRef,
  listRef,
  optionRefs,
}: {
  suggestionsEnabled: boolean;
  /** Fired after any navigation (select / submit). The mobile sheet closes; the
   *  header pill ignores it. */
  onCommit?: () => void;
  /** Whether a final Escape (popup already closed, field already empty) gives
   *  focus back to the page. True for the header pill — the standard way out of
   *  a search box you opened with ⌘K. The mobile sheet leaves it false: there,
   *  Escape is the sheet's own close, and blurring first would fight its focus
   *  trap. */
  escapeBlurs?: boolean;
} & ComboboxRefs) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onSearchPage = pathname === "/search";
  const urlQuery = onSearchPage ? searchParams.get("q") ?? "" : "";
  // Every facet on the results page rides onto the next navigation, so
  // re-searching from the header narrows the same way the current view does.
  // Reading the whole bag (rather than three named params) is what keeps a
  // newly-added facet from being silently dropped here.
  const filters: SearchFilters = onSearchPage
    ? readSearchFilters(Object.fromEntries(searchParams))
    : {};
  // The active result tab travels too: submitting a new term from the Channels
  // tab should search channels, not silently drop you back to videos.
  const resultType = onSearchPage ? readSearchType(searchParams.get("type") ?? undefined) : "videos";

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [value, setValue] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [flipUp, setFlipUp] = useState(false);
  const [composing, setComposing] = useState(false);

  const cacheRef = useRef<Map<string, SearchSuggestion[]>>(new Map());
  const seqRef = useRef(0);
  const focusedRef = useRef(false);
  const shownForRef = useRef<string | null>(null);

  // Reflect the results-page URL query in the box: when `q` (or the page)
  // changes, re-seed the editable draft. Done during render — not in an effect —
  // to avoid a cascading re-render.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  const debounced = useDebouncedValue(value, DEBOUNCE_MS);

  const closePopup = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // Publish a resolved suggestion set (reordered for display), open only while
  // focused with results, announce the count, and emit suggestions_shown once
  // per distinct prefix actually shown.
  const applyResults = useCallback((prefix: string, list: SearchSuggestion[]) => {
    const ordered = orderSuggestions(list);
    setSuggestions(ordered);
    setActiveIndex(-1);
    const shouldOpen = focusedRef.current && ordered.length > 0;
    setOpen(shouldOpen);
    if (shouldOpen) {
      setLiveMessage(
        ordered.length === 1
          ? t("search.suggestionsOne")
          : t("search.suggestionsMany", { count: ordered.length }),
      );
      if (shownForRef.current !== prefix) {
        shownForRef.current = prefix;
        trackSearchEvent({ type: "search.suggestions_shown", query: prefix, count: ordered.length });
      }
    } else {
      setLiveMessage("");
      shownForRef.current = null;
    }
  }, []);

  // Fetch suggestions for the debounced prefix. Guards: suggestions disabled,
  // mid-IME-composition, or an empty prefix. A cache hit resolves without a
  // request. Every path carries a monotonic id so a superseded response is
  // discarded, and all state writes happen in async callbacks.
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

  // Viewport-aware flip for the header pill's popup (measured pre-paint on open).
  // The mobile sheet ignores it.
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
  }, [open, suggestions.length, inputRef, listRef]);

  // Keep the active option scrolled into view during keyboard navigation.
  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, optionRefs]);

  function go(href: string) {
    router.push(href);
    onCommit?.();
  }

  function navigateToQuery(text: string) {
    setValue(text);
    go(searchHref(text.trim(), filters, resultType));
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
          go(`/videos/${encodeURIComponent(s.video_id)}`);
          return;
        }
        navigateToQuery(s.text);
        return;
      case "channel":
        if (s.channel_handle) {
          go(`/channels/${encodeURIComponent(s.channel_handle)}`);
          return;
        }
        navigateToQuery(s.text);
        return;
      case "tag":
        setValue(s.text);
        go(searchHref("", { ...filters, tag: s.text }, resultType));
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
    // The header does nothing on an empty submit; on /search an empty submit
    // clears the results back to the prompt (drops `q`, keeps the filters).
    if (!q && !onSearchPage) return;
    go(searchHref(q, filters, resultType));
  }

  // Clear the field. On /search this navigates back to the prompt (keeping the
  // filters) but never closes the mobile sheet — the user is still searching.
  function clear() {
    setValue("");
    closePopup();
    inputRef.current?.focus();
    if (onSearchPage) router.push(searchHref("", filters, resultType));
  }

  function removeHistoryItem(index: number) {
    const s = suggestions[index];
    if (!s || s.type !== "history") return;
    const next = suggestions.filter((_, i) => i !== index);
    setSuggestions(next);
    const key = debounced.trim();
    if (key) cacheSet(cacheRef.current, key, next);
    setActiveIndex((prev) => {
      if (prev < 0) return prev;
      if (index < prev) return prev - 1;
      if (index === prev) return Math.min(prev, next.length - 1);
      return prev;
    });
    if (next.length === 0) closePopup();
    void api.deleteSearchHistoryEntry(s.text).catch(() => {});
    inputRef.current?.focus();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
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
        return;
      // Escape unwinds the box one step at a time (the convention every
      // command-palette-style search follows): close the suggestions, then
      // clear the draft, then hand focus back to the page.
      case "Escape":
        if (open) {
          e.preventDefault();
          closePopup();
        } else if (value !== "") {
          e.preventDefault();
          setValue("");
        } else if (escapeBlurs) {
          e.preventDefault();
          inputRef.current?.blur();
        }
        return;
      case "Tab":
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

  const showPanel = open && suggestions.length > 0 && debounced.trim().length >= 1;

  return {
    value,
    setValue,
    suggestions,
    activeIndex,
    setActiveIndex,
    liveMessage,
    flipUp,
    showPanel,
    debounced,
    listboxId,
    optionId,
    onKeyDown,
    onFocus: () => {
      focusedRef.current = true;
      if (suggestions.length > 0) setOpen(true);
    },
    onBlur: () => {
      focusedRef.current = false;
      closePopup();
    },
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: () => setComposing(false),
    selectSuggestion,
    removeHistoryItem,
    submitRaw,
    clear,
  } as const;
}

// ── Shared presentational pieces ────────────────────────────────────────────

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      // Keep the input focused (prevent the mousedown blur) — clearing then
      // refocuses it so the caret stays in the box.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={t("search.clear")}
      className="focus-ring -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg"
    >
      <CloseIcon size={16} strokeWidth={2} />
    </button>
  );
}

// Platform read for the keycap glyph, shaped as an external store: the value is
// constant for the life of the tab, so `subscribe` hands back a no-op teardown
// and the snapshot getters are module-level (stable identities, no re-subscribe
// churn). `null` on the server — the platform is not knowable there.
const NOOP_UNSUBSCRIBE = () => {};
const subscribePlatform = () => NOOP_UNSUBSCRIBE;
const readIsMacOnServer = (): boolean | null => null;
const readIsMac = (): boolean | null => {
  const platform = typeof navigator.platform === "string" ? navigator.platform : "";
  return /Mac|iPhone|iPad|iPod/i.test(platform || navigator.userAgent);
};

/**
 * The trailing ⌘K / Ctrl K keycap in the header pill — the affordance that
 * makes the shortcut discoverable without a tooltip. Decorative
 * (`aria-hidden`): assistive tech gets the same information from the input's
 * `aria-keyshortcuts`. The platform is only knowable in the browser, so the
 * glyph fills in after mount; the slot reserves its width up front so resolving
 * it never reflows the pill.
 */
function ShortcutHint() {
  // useSyncExternalStore (rather than an effect) so the server/hydration pass
  // renders the empty slot and the client value lands in the same commit — no
  // setState-in-effect, no hydration mismatch. The platform never changes, so
  // the subscription is a no-op.
  const mac = useSyncExternalStore(subscribePlatform, readIsMac, readIsMacOnServer);

  return (
    <kbd
      aria-hidden="true"
      data-testid="search-shortcut-hint"
      className="pointer-events-none flex h-6 min-w-[2.5rem] shrink-0 items-center justify-center rounded-md border border-border bg-surface px-1.5 text-[11px] font-semibold text-fg-muted"
    >
      {mac === null ? "" : mac ? "⌘K" : "Ctrl K"}
    </kbd>
  );
}

// The rounded-full pill: search glyph, the combobox input, and a trailing slot
// that is the clear × while there is a draft and the ⌘K keycap while there is
// not. The caller wraps it in the role="search" form so submit navigates.
function PillInput({
  c,
  inputRef,
  autoFocus,
  shortcutHint = false,
}: {
  c: Combobox;
  inputRef: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** Header pill only — the phone sheet has no hardware keyboard to hint at. */
  shortcutHint?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 rounded-full border border-border bg-surface-muted px-4 py-2 transition-colors focus-within:bg-surface has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus">
      <SearchIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />
      <input
        ref={inputRef}
        type="search"
        name="q"
        role="combobox"
        aria-expanded={c.showPanel}
        aria-controls={c.listboxId}
        aria-activedescendant={c.showPanel && c.activeIndex >= 0 ? c.optionId(c.activeIndex) : undefined}
        aria-autocomplete="list"
        aria-label={t("search.inputLabel")}
        // Announces the global focus shortcuts to assistive tech; the visible
        // keycap beside it is the sighted equivalent.
        aria-keyshortcuts={shortcutHint ? "Meta+K Control+K /" : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={c.value}
        placeholder={t("search.placeholder")}
        onChange={(e) => c.setValue(e.target.value)}
        onKeyDown={c.onKeyDown}
        onFocus={c.onFocus}
        onBlur={c.onBlur}
        onCompositionStart={c.onCompositionStart}
        onCompositionEnd={c.onCompositionEnd}
        className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:appearance-none"
      />
      {c.value ? <ClearButton onClick={c.clear} /> : shortcutHint ? <ShortcutHint /> : null}
    </div>
  );
}

// The listbox of grouped suggestion rows, shared by the header popup and the
// mobile sheet. Rows are 44px: leading type icon, the label (bold prefix +
// regular completion), and a trailing muted type label (Video / Channel / Tag)
// — except history rows, whose trailing slot is an aria-hidden remove × shown
// while the row is active (Delete on the active option is the keyboard path).
// Group headers are aria-hidden visual sugar; each option carries its own type
// label in the a11y tree.
function SuggestionListbox({
  c,
  listRef,
  optionRefs,
  hidden,
  className,
}: {
  c: Combobox;
  listRef: React.RefObject<HTMLUListElement | null>;
  optionRefs: React.RefObject<(HTMLLIElement | null)[]>;
  hidden: boolean;
  className: string;
}) {
  return (
    <ul
      ref={listRef}
      id={c.listboxId}
      role="listbox"
      aria-label={t("search.suggestionsLabel")}
      hidden={hidden}
      className={className}
    >
      {c.suggestions.map((s, index) => {
        const active = index === c.activeIndex;
        const isHistory = s.type === "history";
        const bucket = TYPE_ORDER[s.type] ?? 0;
        const prevBucket = index > 0 ? TYPE_ORDER[c.suggestions[index - 1].type] ?? 0 : -1;
        const showHeader = bucket >= 1 && bucket !== prevBucket;
        const label = typeLabel(s.type);
        return (
          <Fragment key={`${s.type}-${s.text}-${index}`}>
            {showHeader ? (
              <li
                role="presentation"
                aria-hidden="true"
                className="mt-1 border-t border-border-subtle px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted first:mt-0 first:border-t-0"
              >
                {groupLabel(bucket)}
              </li>
            ) : null}
            <li
              id={c.optionId(index)}
              role="option"
              aria-selected={active}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              // Keep the input focused (activedescendant model): prevent the
              // mousedown blur, then select on click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => c.selectSuggestion(s, index)}
              onMouseMove={() => c.setActiveIndex(index)}
              className={cn(
                "group flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-4 text-sm",
                active ? "bg-surface-muted" : "bg-transparent",
              )}
            >
              {suggestionIcon(s.type)}
              <span className="min-w-0 flex-1 truncate text-fg">
                {highlightMatch(s.text, c.debounced)}
              </span>
              {isHistory ? (
                active ? (
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    title={t("search.removeHistory", { query: s.text })}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      c.removeHistoryItem(index);
                    }}
                    className="focus-ring -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                  >
                    <CloseIcon size={14} strokeWidth={2} />
                  </button>
                ) : null
              ) : label ? (
                <span className="shrink-0 text-[11px] font-medium text-fg-muted">{label}</span>
              ) : null}
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}

// ── The header pill (sm and up) ─────────────────────────────────────────────

function HeaderSearchField({
  suggestionsEnabled,
  inputRef,
}: {
  suggestionsEnabled: boolean;
  /** Owned by the parent so the ⌘K / "/" handler can focus this field. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const c = useSearchCombobox({
    suggestionsEnabled,
    escapeBlurs: true,
    inputRef,
    listRef,
    optionRefs,
  });
  return (
    <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
      <form
        role="search"
        aria-label={t("search.landmark")}
        className="relative w-full max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          c.submitRaw();
        }}
      >
        <PillInput c={c} inputRef={inputRef} shortcutHint />
        <div role="status" aria-live="polite" className="sr-only">
          {c.liveMessage}
        </div>
        <SuggestionListbox
          c={c}
          listRef={listRef}
          optionRefs={optionRefs}
          hidden={!c.showPanel}
          className={cn(
            "scrollbar-none absolute left-0 right-0 z-50 max-h-[28rem] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-raised p-1.5 shadow-soft-strong",
            c.flipUp ? "bottom-full mb-2" : "top-full mt-2",
          )}
        />
      </form>
    </div>
  );
}

// ── The mobile full-screen sheet (below sm) ─────────────────────────────────

function MobileSearchOverlay({
  suggestionsEnabled,
  onClose,
}: {
  suggestionsEnabled: boolean;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const c = useSearchCombobox({ suggestionsEnabled, onCommit: onClose, inputRef, listRef, optionRefs });
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus the input, lock body scroll, trap Tab, and close on Escape (focus is
  // returned to the trigger by the caller's onClose).
  useEffect(() => {
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = overlayRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // inputRef is a stable ref object; onClose is stable (useCallback).
  }, [inputRef, onClose]);

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex flex-col bg-canvas sm:hidden"
    >
      <div className="flex items-center gap-1.5 px-2 pb-1 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("search.close")}
          title={t("search.close")}
          className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <ChevronLeftIcon size={22} strokeWidth={2} />
        </button>
        <form
          role="search"
          aria-label={t("search.landmark")}
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            c.submitRaw();
          }}
        >
          <PillInput c={c} inputRef={inputRef} autoFocus />
          <div role="status" aria-live="polite" className="sr-only">
            {c.liveMessage}
          </div>
        </form>
      </div>
      <SuggestionListbox
        c={c}
        listRef={listRef}
        optionRefs={optionRefs}
        hidden={!c.showPanel}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 pb-8 pt-1"
      />
    </div>,
    document.body,
  );
}

/**
 * SearchAutocomplete — the ONE site-search box, rendered by the app header on
 * every page and breakpoint (WAI-ARIA 1.2 combobox-with-listbox pattern):
 *
 *  - Desktop (sm+): a centered pill combobox in the header; its popup is an
 *    absolute overlay so loading / empty / degraded states never shift layout —
 *    they are simply silent.
 *  - Mobile (<sm): the header shows a search icon button; tapping it opens a
 *    full-screen sheet (input + back button, suggestions below) with a Tab
 *    focus trap, Escape / back to collapse, body scroll locked, and focus
 *    returned to the icon button on close. When the Search tab lands on an empty
 *    /search, the sheet auto-opens with the keyboard focused.
 *
 *  - Shortcuts: ⌘K / Ctrl+K and "/" focus the box from anywhere in the app
 *    (opening the sheet instead on phones), Escape steps back out of it
 *    (suggestions → draft → focus), and the pill carries a ⌘K keycap plus
 *    `aria-keyshortcuts` so both sighted and AT users can find it.
 *
 * There is exactly one visible role="search" landmark at a time. Suggestions are
 * gated on the instance's effective `suggestions_enabled`; when off (or the
 * service is down) the box is a plain search field with a silent panel — the
 * input, its submit, and the results page are unaffected.
 */
export function SearchAutocomplete({ suggestionsEnabled = true }: { suggestionsEnabled?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const autoOpenedRef = useRef(false);

  // Global focus shortcuts: ⌘K / Ctrl+K anywhere, and the bare "/" that every
  // browse-first site (YouTube, GitHub) has trained people to expect. Both land
  // in whichever surface this breakpoint actually shows — the header pill at
  // sm+, the full-screen sheet on phones (a hardware keyboard on a tablet-sized
  // phone layout still deserves the shortcut).
  //
  // Skipped when: a modal dialog owns focus (the shortcut must not pull focus
  // out of a trap), the sheet is already open (it has its own key handling), the
  // event was already handled, or an IME is composing. The bare "/" is
  // additionally skipped while the caret is in any other field — there it is a
  // character, not a command — which also lets it be typed inside this box.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const chord = e.metaKey || e.ctrlKey;
      const isCommandK = chord && !e.altKey && (e.key === "k" || e.key === "K");
      const isSlash = !chord && !e.altKey && e.key === "/";
      if (!isCommandK && !isSlash) return;
      if (mobileOpen) return;
      if (isSlash && isEditableTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;

      e.preventDefault();
      const phone =
        typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches;
      if (phone) {
        setMobileOpen(true);
        return;
      }
      const input = headerInputRef.current;
      if (input === null) return;
      input.focus();
      // Select rather than append: re-triggering the shortcut over an existing
      // query should let the next keystroke replace it.
      input.select();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const emptySearchPage = pathname === "/search" && (searchParams.get("q") ?? "") === "";

  // Auto-open the mobile sheet when the Search tab lands on an empty /search
  // (phones only). Rising-edge guarded so dismissing it doesn't re-open it. The
  // open is deferred to a microtask so the effect body never sets state
  // synchronously (cascading-render lint).
  useEffect(() => {
    if (!emptySearchPage) {
      autoOpenedRef.current = false;
      return;
    }
    if (autoOpenedRef.current) return;
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches) return;
    autoOpenedRef.current = true;
    Promise.resolve().then(() => setMobileOpen(true));
  }, [emptySearchPage]);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <HeaderSearchField suggestionsEnabled={suggestionsEnabled} inputRef={headerInputRef} />
      <div className="flex flex-1 justify-end sm:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={t("search.open")}
          title={t("search.open")}
          aria-expanded={mobileOpen}
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <SearchIcon size={22} strokeWidth={2} />
        </button>
      </div>
      {mobileOpen ? (
        <MobileSearchOverlay suggestionsEnabled={suggestionsEnabled} onClose={closeMobile} />
      ) : null}
    </>
  );
}

/**
 * A static, non-interactive twin of the search box with identical dimensions.
 * The header renders it as the Suspense fallback while the interactive box —
 * which reads `useSearchParams` to reflect the results-page query — resolves, so
 * statically prerendered routes don't bail to CSR and there is no layout shift.
 */
export function SearchAutocompleteFallback() {
  return (
    <>
      <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
        <div className="relative w-full max-w-xl">
          <div className="flex min-h-11 items-center gap-2.5 rounded-full border border-border bg-surface-muted px-4 py-2">
            <SearchIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
              {t("search.placeholder")}
            </span>
            {/* The keycap slot, reserved at the same size the live pill uses so
                hydration swaps content into it without moving anything. */}
            <span aria-hidden="true" className="h-6 min-w-[2.5rem] shrink-0" />
          </div>
        </div>
      </div>
      <div className="flex flex-1 justify-end sm:hidden">
        <span className="flex h-11 w-11 items-center justify-center rounded-full text-fg-muted">
          <SearchIcon size={22} strokeWidth={2} />
        </span>
      </div>
    </>
  );
}
