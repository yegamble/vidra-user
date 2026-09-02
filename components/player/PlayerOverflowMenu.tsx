"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { CheckIcon, MoreVerticalIcon } from "@/components/icons";
import { OverlayButton } from "@/components/player/OverlayButton";
import { usePlayerPopup } from "@/components/player/use-player-popup";

/** An on/off control (captions, autoplay, PiP, theater, mute). */
export interface OverflowToggle {
  id: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
}

/**
 * A graded choice (speed, quality). Values are strings so a single menu can
 * carry groups of different underlying types; callers map back on select.
 */
export interface OverflowChoiceGroup {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onSelect: (value: string) => void;
}

/**
 * PlayerOverflowMenu is the control bar's "⋮" escape hatch: it holds every
 * control the bar is too narrow to show, so no player control is ever
 * unreachable no matter how narrow the stage gets.
 *
 * It exists because the bar physically cannot hold the full control set. At a
 * 360px viewport the stage is 328px wide and the row's intrinsic width — with a
 * real long-video time readout, a quality menu and the PiP/theater controls — is
 * 488px. The bar's answer used to be to let the surplus overflow an
 * `overflow-hidden` stage, which silently CLIPPED the trailing controls
 * (Fullscreen first). Tiering controls out of the bar is only acceptable if
 * they land somewhere; this is that somewhere.
 *
 * The menu is portaled and viewport-positioned by usePlayerPopup for the same
 * reason the speed/quality ladders are: the stage is ~185px tall on a phone and
 * clips anything drawn inside it.
 */
export function PlayerOverflowMenu({
  toggles,
  groups,
}: {
  toggles: OverflowToggle[];
  groups: OverflowChoiceGroup[];
}) {
  const { open, container, rootRef, buttonRef, popupRef, openPopup, closePopup, popupStyle } =
    usePlayerPopup();
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Focus the first row once the portal has mounted. Keyed on the open/portal
  // transition only — never on the item arrays, which callers rebuild on every
  // render and which would otherwise drag focus back mid-interaction.
  useEffect(() => {
    if (!open || !container) return;
    rowRefs.current[0]?.focus();
  }, [open, container]);

  if (toggles.length === 0 && groups.length === 0) return null;

  function closeAndRefocus() {
    closePopup();
    buttonRef.current?.focus();
  }

  function moveFocus(from: number, delta: number) {
    const rows = rowRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (rows.length === 0) return;
    rows[(from + delta + rows.length) % rows.length]?.focus();
  }

  // One flat, DOM-ordered index across every row, so the arrow keys traverse
  // toggles and groups alike as a single menu. Offsets are derived rather than
  // counted with a mutable cursor during render.
  const groupOffsets = groups.reduce<number[]>((offsets, _g, i) => {
    offsets.push(
      i === 0 ? toggles.length : offsets[i - 1] + groups[i - 1].items.length,
    );
    return offsets;
  }, []);

  const rowProps = (i: number, onActivate: () => void) => {
    return {
      ref: (el: HTMLButtonElement | null) => {
        rowRefs.current[i] = el;
      },
      tabIndex: -1,
      onClick: () => {
        onActivate();
        closeAndRefocus();
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveFocus(i, 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(i, -1);
        }
      },
      className:
        "focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm text-fg transition-colors hover:bg-surface-muted",
    };
  };

  return (
    <div ref={rootRef} className="relative">
      <OverlayButton
        ref={buttonRef}
        label="More player options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? closePopup() : openPopup())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openPopup();
          }
        }}
      >
        <MoreVerticalIcon size={20} aria-hidden="true" />
      </OverlayButton>
      {open && container
        ? createPortal(
            <div
              ref={popupRef}
              role="menu"
              aria-label="More player options"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  closeAndRefocus();
                }
              }}
              style={popupStyle}
              className="z-50 max-h-[min(22rem,calc(100vh-1rem))] w-56 overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-lg"
            >
              {toggles.map((t, ti) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={t.pressed}
                  {...rowProps(ti, t.onToggle)}
                >
                  <span aria-hidden="true" className="flex w-4 justify-center">
                    {t.pressed ? <CheckIcon size={16} /> : null}
                  </span>
                  <span>{t.label}</span>
                </button>
              ))}
              {groups.map((g, gi) => (
                <div key={g.id} role="group" aria-label={g.label} className="pt-1">
                  {/* aria-hidden: the group already carries the name via
                      aria-label, so announcing the heading again is noise. */}
                  <p
                    aria-hidden="true"
                    className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-fg-muted"
                  >
                    {g.label}
                  </p>
                  {g.items.map((item, ii) => (
                    <button
                      key={item.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.value === g.value}
                      {...rowProps(groupOffsets[gi] + ii, () => g.onSelect(item.value))}
                    >
                      <span aria-hidden="true" className="flex w-4 justify-center">
                        {item.value === g.value ? <CheckIcon size={16} /> : null}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>,
            container,
          )
        : null}
    </div>
  );
}
