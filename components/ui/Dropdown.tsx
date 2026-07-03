"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export type DropdownItem = {
  /** Item label. */
  label: ReactNode;
  /** Invoked on select (click / Enter / Space); the menu closes afterward. */
  onSelect: () => void;
  disabled?: boolean;
  /** Style the item as destructive (e.g. Delete). */
  danger?: boolean;
};

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
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

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
      const list = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
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
    const list = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
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
          "inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors focus-ring hover:bg-surface-muted",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          className={cn(
            "absolute z-40 mt-1 min-w-40 rounded-md border border-border-subtle bg-surface-raised py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => (
            <button
              key={index}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onKeyDown={(e) => onItemKeyDown(e, index)}
              onClick={() => {
                item.onSelect();
                closeAndRefocus();
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-sm transition-colors focus-ring disabled:opacity-50",
                item.danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-surface-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
