"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

/** A selectable menu row. */
export type DropdownMenuItem = {
  /** Item label. */
  label: ReactNode;
  /**
   * Invoked on select (click / Enter / Space); the menu closes afterward.
   * Optional when `href` is set (navigation is the action).
   */
  onSelect?: () => void;
  /**
   * When set the row is a real navigation link (`next/link`, `role="menuitem"`):
   * selecting it navigates. `onSelect` still fires first (e.g. to close a sheet).
   */
  href?: string;
  /** Leading icon rendered before the label (16–18px glyph). */
  icon?: ReactNode;
  disabled?: boolean;
  /** Style the item as destructive (e.g. Delete). */
  danger?: boolean;
};

/** A non-interactive divider between groups of items (`role="separator"`). */
export type DropdownSeparator = { type: "separator" };

/** A non-interactive group heading (decorative; skipped in the focus ring). */
export type DropdownLabel = { type: "label"; label: ReactNode };

export type DropdownItem = DropdownMenuItem | DropdownSeparator | DropdownLabel;

function isSeparator(item: DropdownItem): item is DropdownSeparator {
  return "type" in item && item.type === "separator";
}

function isLabel(item: DropdownItem): item is DropdownLabel {
  return "type" in item && item.type === "label";
}

export type DropdownProps = {
  /** Trigger contents (text and/or icon). */
  trigger: ReactNode;
  /** Accessible name for the trigger (recommended when icon-only). */
  triggerLabel?: string;
  items: DropdownItem[];
  /** Menu alignment relative to the trigger. */
  align?: "start" | "end";
  className?: string;
  triggerClassName?: string;
};

/**
 * Dropdown — an accessible menu button (WAI-ARIA menu-button pattern):
 *  - the trigger is `aria-haspopup="menu"` + `aria-expanded`;
 *  - the list is `role="menu"` with `role="menuitem"` children;
 *  - ArrowDown/ArrowUp move (and wrap) focus between items, Home/End jump,
 *    Escape closes and returns focus to the trigger, and a click outside closes;
 *  - opening with ArrowDown focuses the first item, ArrowUp the last.
 */
export function Dropdown({
  trigger,
  triggerLabel,
  items,
  align = "start",
  className,
  triggerClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Refs to the FOCUSABLE rows only (separators are skipped), indexed by their
  // position among focusable rows so arrow navigation walks a dense list. Holds
  // both buttons (action rows) and anchors (href rows).
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();
  // Viewport-aware placement, measured pre-paint each time the menu opens:
  // flip above the trigger when the space below can't fit the menu, and flip
  // the horizontal alignment when the preferred side would leave the viewport.
  const [placement, setPlacement] = useState<{ up: boolean; end: boolean }>({
    up: false,
    end: align === "end",
  });

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const t = trigger.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    const menuW = menu.offsetWidth;
    const margin = 8;
    const spaceBelow = window.innerHeight - t.bottom - margin;
    const spaceAbove = t.top - margin;
    const up = spaceBelow < menuH && spaceAbove > spaceBelow;
    let end = align === "end";
    if (end && t.right - menuW < margin && t.left + menuW <= window.innerWidth - margin) {
      end = false;
    } else if (!end && t.left + menuW > window.innerWidth - margin && t.right - menuW >= margin) {
      end = true;
    }
    setPlacement({ up, end });
  }, [open, align, items.length]);

  // Close on outside click / focus leaving the widget.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openMenu(focus: "first" | "last") {
    setOpen(true);
    // Focus after the menu renders.
    requestAnimationFrame(() => {
      const list = itemRefs.current.filter(Boolean) as HTMLElement[];
      const target = focus === "first" ? list[0] : list[list.length - 1];
      target?.focus();
    });
  }

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openMenu("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu("last");
    }
  }

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    const list = itemRefs.current.filter(Boolean) as HTMLElement[];
    const last = list.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[index === last ? 0 : index + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[index === 0 ? last : index - 1]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[last]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocus();
    } else if (e.key === "Enter" || e.key === " ") {
      // Buttons activate natively on Enter/Space; anchors only on Enter, so we
      // trigger the click ourselves (preventing the native Enter to avoid a
      // double navigation) to give href rows Space activation too.
      const el = list[index];
      if (el instanceof HTMLAnchorElement) {
        e.preventDefault();
        el.click();
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? setOpen(false) : openMenu("first"))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-fg transition-colors focus-ring hover:bg-surface-muted",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={triggerLabel}
          className={cn(
            "absolute z-40 min-w-52 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-soft-strong",
            "max-h-[min(60vh,480px)]",
            placement.up ? "bottom-full mb-1" : "top-full mt-1",
            placement.end ? "right-0" : "left-0",
          )}
        >
          {(() => {
            // Walk the items, assigning each focusable row a dense index (so
            // separators don't leave gaps in the arrow-key ring) and rendering
            // href rows as links, the rest as buttons.
            let focusIndex = -1;
            return items.map((item, index) => {
              if (isSeparator(item)) {
                return (
                  <div
                    key={`sep-${index}`}
                    role="separator"
                    className="my-1 h-px bg-border-subtle"
                  />
                );
              }
              if (isLabel(item)) {
                return (
                  <div
                    key={`label-${index}`}
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted"
                  >
                    {item.label}
                  </div>
                );
              }
              const rowIndex = (focusIndex += 1);
              const rowClass = cn(
                "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus-ring disabled:opacity-50",
                item.danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-surface-muted",
              );
              const body = (
                <>
                  {item.icon ? (
                    <span aria-hidden="true" className="flex shrink-0 items-center justify-center">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">{item.label}</span>
                </>
              );
              if (item.href) {
                return (
                  <Link
                    key={index}
                    ref={(el) => {
                      itemRefs.current[rowIndex] = el;
                    }}
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={item.disabled || undefined}
                    onKeyDown={(e) => onItemKeyDown(e, rowIndex)}
                    onClick={() => {
                      item.onSelect?.();
                      closeAndRefocus();
                    }}
                    className={rowClass}
                  >
                    {body}
                  </Link>
                );
              }
              return (
                <button
                  key={index}
                  ref={(el) => {
                    itemRefs.current[rowIndex] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onKeyDown={(e) => onItemKeyDown(e, rowIndex)}
                  onClick={() => {
                    item.onSelect?.();
                    closeAndRefocus();
                  }}
                  className={rowClass}
                >
                  {body}
                </button>
              );
            });
          })()}
        </div>
      ) : null}
    </div>
  );
}
