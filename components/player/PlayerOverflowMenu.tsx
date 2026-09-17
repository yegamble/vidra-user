"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, SettingsIcon } from "@/components/icons";
import { OverlayButton } from "@/components/player/OverlayButton";
import { usePlayerPopup } from "@/components/player/use-player-popup";

export interface OverflowToggle {
  id: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
}

export interface OverflowChoiceGroup {
  id: string;
  label: string;
  value: string;
  valueLabel?: string;
  items: { value: string; label: string }[];
  onSelect: (value: string) => void;
  groups?: OverflowChoiceGroup[];
}

/** One settings hierarchy, portaled outside the stage (or into fullscreen). */
export function PlayerOverflowMenu({ toggles, groups }: {
  toggles: OverflowToggle[];
  groups: OverflowChoiceGroup[];
}) {
  const { open, container, rootRef, buttonRef, popupRef, openPopup, closePopup, popupStyle, remeasure } = usePlayerPopup();
  const [path, setPath] = useState<string[]>([]);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusIndex = useRef(0);
  let active: OverflowChoiceGroup | undefined;
  let children = groups;
  for (const id of path) {
    active = children.find((group) => group.id === id);
    children = active?.groups ?? [];
  }
  const rows = active?.items ?? [];
  const switches = active ? [] : toggles;
  const offset = active ? 1 : 0;
  const count = offset + rows.length + switches.length + children.length;

  // Submenus have different dimensions. Measure and focus only on navigation,
  // never on playback ticks that rebuild the menu's data while someone uses it.
  useLayoutEffect(() => {
    if (!open || !container) return;
    rowRefs.current[focusIndex.current]?.focus({ preventScroll: true });
    remeasure();
  }, [open, container, path, remeasure]);

  if (toggles.length === 0 && groups.length === 0) return null;

  function closeAndRefocus() {
    closePopup();
    buttonRef.current?.focus({ preventScroll: true });
  }
  function openRoot() {
    focusIndex.current = 0;
    setPath([]);
    openPopup();
  }
  function enter(group: OverflowChoiceGroup) {
    const checked = group.items.findIndex((item) => item.value === group.value);
    focusIndex.current = checked >= 0 ? checked + 1 : 0;
    setPath([...path, group.id]);
  }
  function back() {
    let siblings = groups;
    for (const id of path.slice(0, -1)) siblings = siblings.find((g) => g.id === id)?.groups ?? [];
    let parent: OverflowChoiceGroup | undefined;
    let level = groups;
    for (const id of path.slice(0, -1)) { parent = level.find((g) => g.id === id); level = parent?.groups ?? []; }
    focusIndex.current = (parent ? 1 + parent.items.length : toggles.length) + siblings.findIndex((g) => g.id === path.at(-1));
    setPath(path.slice(0, -1));
  }
  const rowProps = (index: number, activate: () => void, submenu = false) => ({
    ref: (el: HTMLButtonElement | null) => { rowRefs.current[index] = el; },
    tabIndex: -1,
    onClick: activate,
    onKeyDown: (e: React.KeyboardEvent) => {
      let next: number | undefined;
      if (e.key === "ArrowDown") next = (index + 1) % count;
      if (e.key === "ArrowUp") next = (index - 1 + count) % count;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = count - 1;
      if (next !== undefined) { e.preventDefault(); rowRefs.current[next]?.focus({ preventScroll: true }); rowRefs.current[next]?.scrollIntoView?.({ block: "nearest" }); }
      if (e.key === "ArrowRight" && submenu) { e.preventDefault(); activate(); }
    },
    className: "focus-ring flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-fg transition-colors",
  });

  return (
    <div ref={rootRef} className="relative shrink-0">
      <OverlayButton ref={buttonRef} label="Settings" aria-haspopup="menu" aria-expanded={open}
        onClick={() => open ? closePopup() : openRoot()}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); openRoot(); } }}>
        <SettingsIcon size={22} strokeWidth={2.3} />
      </OverlayButton>
      {open && container ? createPortal(
        <div ref={popupRef} role="menu" aria-label={active?.label ?? "Settings"} style={popupStyle}
          className="player-settings-menu z-50 max-h-[min(25rem,calc(100dvh-1rem))] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAndRefocus(); }
            if (e.key === "ArrowLeft" && active) { e.preventDefault(); e.stopPropagation(); back(); }
            if (e.key === "Tab") closePopup();
          }}>
          {active ? <button type="button" role="menuitem" aria-label="Back to settings" {...rowProps(0, back)}>
            <ChevronLeftIcon size={18} /><span>{active.label}</span>
          </button> : null}
          {switches.map((toggle, index) => <button key={toggle.id} type="button" role="menuitemcheckbox"
            aria-checked={toggle.pressed} {...rowProps(index, () => { toggle.onToggle(); closeAndRefocus(); })}>
            <span className="flex-1">{toggle.label}</span>
            <span aria-hidden="true" className={`flex h-5 w-8 shrink-0 items-center rounded-full px-0.5 ${toggle.pressed ? "justify-end bg-accent" : "bg-surface-strong ring-1 ring-border"}`}>
              <span className="h-4 w-4 rounded-full bg-surface" />
            </span>
          </button>)}
          {rows.map((item, index) => <button key={item.value} type="button" role="menuitemradio" aria-checked={item.value === active?.value}
            {...rowProps(offset + index, () => { active?.onSelect(item.value); closeAndRefocus(); })}>
            <span aria-hidden="true" className="flex w-4 shrink-0 justify-center">{item.value === active?.value ? <CheckIcon size={16} /> : null}</span>
            <span>{item.label}</span>
          </button>)}
          {children.map((group, index) => <button key={group.id} type="button" role="menuitem" aria-haspopup="menu"
            {...rowProps(offset + switches.length + rows.length + index, () => enter(group), true)}>
            <span className="flex-1">{group.label}</span>
            <span className="max-w-[45%] truncate text-fg-muted">{group.valueLabel ?? group.items.find((item) => item.value === group.value)?.label}</span>
            <ChevronRightIcon size={16} className="shrink-0" />
          </button>)}
        </div>, container,
      ) : null}
    </div>
  );
}
