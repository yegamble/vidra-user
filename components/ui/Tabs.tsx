"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type TabItem = {
  /** Stable id, used for the tab/panel aria wiring and as the selection key. */
  id: string;
  /** Visible tab label. */
  label: ReactNode;
  /** Panel content shown when this tab is active. */
  panel: ReactNode;
};

export type TabsProps = {
  tabs: TabItem[];
  /** Initially-selected tab id (defaults to the first tab). Uncontrolled only. */
  defaultTabId?: string;
  /**
   * Selected tab id when the caller owns the selection — e.g. from the URL, so
   * the chosen tab is shareable. Uncontrolled otherwise.
   */
  activeTabId?: string;
  /** Notified on every selection change, controlled or not. */
  onTabChange?: (id: string) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
};

/**
 * Tabs — an accessible tab set following the WAI-ARIA tabs pattern:
 *  - `role="tablist"` / `role="tab"` / `role="tabpanel"` with aria-controls /
 *    aria-labelledby / aria-selected wiring;
 *  - roving tabindex (only the active tab is in the tab order; the panel is
 *    reachable via Tab after it);
 *  - ArrowLeft/ArrowRight move (and wrap) selection, Home/End jump to the
 *    first/last tab, and selection follows focus.
 *
 * This is the in-page tab primitive (state-driven), controlled or uncontrolled.
 * Route-backed sub-navs (e.g. the admin/moderation tab bars that are really
 * links) intentionally stay as `<Link>` lists and do not use this.
 */
export function Tabs({
  tabs,
  defaultTabId,
  activeTabId,
  onTabChange,
  label,
  className,
}: TabsProps) {
  const baseId = useId();
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultTabId ?? tabs[0]?.id);
  const controlled = activeTabId !== undefined;
  const active = controlled ? activeTabId : uncontrolledActive;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function setActive(id: string) {
    if (!controlled) setUncontrolledActive(id);
    onTabChange?.(id);
  }

  function tabId(id: string) {
    return `${baseId}-tab-${id}`;
  }
  function panelId(id: string) {
    return `${baseId}-panel-${id}`;
  }

  function focusTab(id: string) {
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      focusTab(tabs[next].id);
    }
  }

  const activePanel = tabs.find((tab) => tab.id === active);

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border-subtle">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-ring",
                selected
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activePanel ? (
        <div
          role="tabpanel"
          id={panelId(activePanel.id)}
          aria-labelledby={tabId(activePanel.id)}
          tabIndex={0}
          className="focus-ring pt-4"
        >
          {activePanel.panel}
        </div>
      ) : null}
    </div>
  );
}
