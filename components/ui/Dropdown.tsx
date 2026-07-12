"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
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
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
            "absolute z-40 min-w-52 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-lg",
            "max-h-[min(60vh,480px)]",
            placement.up ? "bottom-full mb-1" : "top-full mt-1",
            placement.end ? "right-0" : "left-0",
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
                "block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus-ring disabled:opacity-50",
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
