"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { CheckIcon, CloseIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { InstanceResponse, InstanceSettingsResponse } from "@/lib/api";
import { SETUP_DISMISS_KEY, buildSetupItems, hasOpenWork, type SetupItem } from "@/lib/admin-setup";

// WordPress-style welcome panel: ~118 settings over nine config pages give a
// new owner no hint where to start. Dismissal is per-viewer, in localStorage,
// every access guarded so a blocked store never crashes or pins the card.
function readDismissed(): boolean {
  try {
    return localStorage.getItem(SETUP_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// A failed read leaves that item link-only (done = null) rather than putting an
// error box above the real dashboard.
export function AdminSetupChecklist() {
  const [dismissed, setDismissed] = useState(true); // closed until storage is read
  const [items, setItems] = useState<SetupItem[] | null>(null);
  const titleId = useId();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      api.getInstance(signal).catch((): InstanceResponse | null => null),
      api.getInstanceSettings(signal).catch((): InstanceSettingsResponse | null => null),
    ]).then(([instance, settings]) => {
      if (signal.aborted) return;
      setDismissed(readDismissed()); // read after the fetch: no flash, no sync setState in the effect
      setItems(buildSetupItems(instance, settings));
    });
    return () => controller.abort();
  }, []);

  if (dismissed || !items || !hasOpenWork(items)) return null;

  const derivable = items.filter((i) => i.done !== null);
  const doneCount = derivable.filter((i) => i.done).length;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(SETUP_DISMISS_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
  };

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-2xl bg-surface shadow-soft">
      <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[15px] font-bold tracking-tight text-fg">Finish setting up</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {doneCount} of {derivable.length} done — the settings most operators change first.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss setup checklist"
          className="focus-ring -mr-2 -mt-1 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <CloseIcon size={16} strokeWidth={2.2} />
        </button>
      </div>
      <ul>
        {items.map((item, i) => (
          <ChecklistRow key={item.title} item={item} first={i === 0} />
        ))}
      </ul>
    </section>
  );
}

function ChecklistRow({ item, first }: { item: SetupItem; first: boolean }) {
  const labelId = useId();
  const linkClass =
    "focus-ring inline-flex min-h-11 items-center rounded text-[13px] font-semibold text-accent-text underline underline-offset-2 hover:text-fg";
  return (
    <li
      aria-labelledby={labelId}
      className={`flex items-center gap-3 px-4 py-2 ${first ? "" : "border-t border-border-subtle"}`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${
          item.done ? "bg-success-solid text-white" : "border border-border"
        }`}
      >
        {item.done ? <CheckIcon size={13} strokeWidth={2.6} /> : null}
      </span>
      <div className="min-w-0 flex-1 py-1">
        <p id={labelId} className="text-sm font-semibold tracking-tight text-fg">{item.title}</p>
        <p className="mt-0.5 text-[13px] text-fg-muted">{item.description}</p>
        {item.done !== null && (
          <p className={`mt-0.5 text-[12px] font-semibold ${item.done ? "text-success" : "text-fg-muted"}`}>
            {item.done ? "Done" : "To do"}
          </p>
        )}
      </div>
      {item.external ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={linkClass}>{item.action}</a>
      ) : (
        <Link href={item.href} className={linkClass}>{item.action}</Link>
      )}
    </li>
  );
}
