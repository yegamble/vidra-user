"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { Button, buttonClasses } from "@/components/ui/Button";

export type AnalyticsChoice = "granted" | "denied";
export function AnalyticsConsent({ choice, onChange }: { choice: AnalyticsChoice | null; onChange: (choice: AnalyticsChoice) => void }) {
  const t = useT();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (choice !== null && restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [choice, expanded]);
  function choose(next: AnalyticsChoice) {
    restoreFocus.current = true;
    onChange(next);
    setExpanded(false);
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {choice !== null ? (
        <button ref={triggerRef} type="button" aria-expanded={expanded} aria-controls={panelId} className={buttonClasses("ghost", "md")} onClick={() => setExpanded(value => !value)}>
          {t("analytics.consent.preferences")}
        </button>
      ) : null}
      {choice === null || expanded ? (
        <section id={panelId} aria-labelledby={`${panelId}-title`} aria-describedby={`${panelId}-description`} className="w-full rounded-2xl border border-border-subtle bg-surface p-4 shadow-soft sm:flex sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <h2 id={`${panelId}-title`} className="text-sm font-semibold text-fg">{t("analytics.consent.title")}</h2>
            <p id={`${panelId}-description`} className="mt-1 text-sm leading-relaxed text-fg-muted">{t("analytics.consent.description")}</p>
            {choice !== null ? <p className="mt-2 text-caption font-medium text-fg-muted">{t(choice === "granted" ? "analytics.consent.granted" : "analytics.consent.denied")}</p> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-0 sm:w-64 sm:shrink-0">
            <Button variant="secondary" onClick={() => choose("granted")}>{t("analytics.consent.accept")}</Button>
            <Button variant="secondary" onClick={() => choose("denied")}>{t("analytics.consent.decline")}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
