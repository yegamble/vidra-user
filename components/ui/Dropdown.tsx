"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
  /**
   * Trigger chrome:
   *  - `"default"` — the labelled pill (border + surface bg + `px-3.5 py-1.5`
   *    text padding). Unchanged for existing text/icon-plus-label triggers.
   *  - `"icon"` — a borderless, transparent, round icon button with **no
   *    padding class at all**, so the call site's own `h-` / `w-` sizing fully
   *    controls the hit area and the glyph is never flex-shrunk.
   *
   * Use `"icon"` for kebab / overflow triggers. Never try to neutralise the
   * default pill's `px-3.5 py-1.5` with a `p-0` in `triggerClassName`: same-group
   * Tailwind utilities resolve by stylesheet order (this repo's `cn()` is a plain
   * concat, no tailwind-merge), so the base padding wins and the SVG collapses.
   */
  triggerVariant?: "default" | "icon";
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
  triggerVariant = "default",
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
  // Fixed viewport coordinates for the portaled menu, measured pre-paint each
  // time it opens (and on scroll/resize while open). Because the menu lives at
  // the document body — not inside the `overflow-x-auto` rails — it can never be
  // clipped; the rects come straight from the trigger. `null` until measured.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure the trigger, flip up/down + start/end to stay on-screen, and emit
  // fixed top/left. Same flip heuristics as before, now feeding coordinates
  // instead of Tailwind top-full/right-0 classes.
  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const t = trigger.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    const menuW = menu.offsetWidth;
    const margin = 8; // viewport edge keep-out
    const gap = 4; // trigger↔menu gap (matches the old mt-1/mb-1)
    const spaceBelow = window.innerHeight - t.bottom - margin;
    const spaceAbove = t.top - margin;
    const up = spaceBelow < menuH && spaceAbove > spaceBelow;
    let end = align === "end";
    if (end && t.right - menuW < margin && t.left + menuW <= window.innerWidth - margin) {
      end = false;
    } else if (!end && t.left + menuW > window.innerWidth - margin && t.right - menuW >= margin) {
      end = true;
    }
    const rawTop = up ? t.top - menuH - gap : t.bottom + gap;
    const rawLeft = end ? t.right - menuW : t.left;
    // Clamp fully inside the viewport so a trigger near an edge can't push the
    // menu (or its last item) off-screen.
    const top = Math.max(margin, Math.min(rawTop, window.innerHeight - menuH - margin));
    const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - menuW - margin));
    setPos({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, items.length, measure]);

  // Keep the fixed menu pinned to the trigger while open: capture-phase scroll
  // catches the rail's own scroll (the bug repro), and resize re-runs the flip.
  useEffect(() => {
    if (!open) return;
    const onReflow = () => measure();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, measure]);

  // Close on outside click / focus leaving the widget. The menu is portaled out
  // of `rootRef`, so a click inside it must still count as inside: treat clicks
  // within EITHER the trigger root or the portaled menu as inside.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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
      // preventScroll: opening must not scroll the rail to bring the focused row
      // into view (the "tiles raise up" bug) — the fixed menu is already visible.
      target?.focus({ preventScroll: true });
    });
  }

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
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
          triggerVariant === "icon"
            ? // Icon-button chrome mirroring IconButton: no border, transparent
              // bg, and — critically — NO padding utility, so call-site h-*/w-*
              // sizing is the sole size authority and the glyph never shrinks.
              "inline-flex items-center justify-center rounded-full text-fg transition-colors focus-ring hover:bg-surface-muted"
            : "inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-fg transition-colors focus-ring hover:bg-surface-muted",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {/* The menu is portaled to <body> and positioned `fixed`, so it escapes
          the rails' `overflow` clipping context. `open` only flips true from a
          client-side event, so this branch never runs during SSR / hydration
          (open is false there); the `typeof document` guard is belt-and-braces
          so `createPortal(..., document.body)` can never see an undefined DOM. */}
      {open && typeof document !== "undefined" ? (
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={triggerLabel}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
            }}
            className={cn(
              // Body-level z-50 layer (Header z-30, Modal z-50, search sheet
              // z-[60]); fixed to the viewport so the rails' `overflow-y: auto`
              // can never clip it. Kept invisible until the first pre-paint
              // measurement lands, so it is never painted at the -9999 seed.
              "z-50 min-w-52 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-soft-strong",
              "max-h-[min(60vh,480px)]",
              pos ? "visible" : "invisible",
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
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}
