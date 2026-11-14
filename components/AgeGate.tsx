"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useOptionalSession } from "@/components/auth/AuthProvider";
import { useT } from "@/components/I18nProvider";
import { Button } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import {
  ageGateExempt,
  clearAgeGateReload,
  rememberAgeConfirmation,
  reloadForAgeGate,
} from "@/lib/age-gate";

/**
 * AgeGate stands in for the page while the server layout found no confirmation
 * of the instance's minimum age (`pending`). The page is never mounted behind
 * it, so no player, autoplay or ad starts; the layout has already left the
 * custom script, ads and analytics out of this render.
 *
 * Confirming stores the cookie and reloads, so the server renders the page
 * with them. Where the browser refuses the cookie (an embed in a browser that
 * blocks third-party cookies) the page mounts for this view only, still
 * without them. A signed-in account passes without being asked; its cookie is
 * stored without a reload, so only its next page load carries them. The
 * pathname is read here, not in the layout, because a client navigation does
 * not re-render the layout.
 */
export function AgeGate({
  pending,
  minimumAge,
  children,
}: {
  pending: boolean;
  minimumAge: number;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const authed = useOptionalSession()?.status === "authed";
  const [passed, setPassed] = useState(false);
  const [left, setLeft] = useState(false);
  const gated = pending && minimumAge > 0 && !passed && !authed;

  useEffect(() => {
    if (!pending) clearAgeGateReload();
  }, [pending]);

  useEffect(() => {
    if (pending && minimumAge > 0 && authed) rememberAgeConfirmation(minimumAge);
  }, [pending, minimumAge, authed]);

  if (!gated || ageGateExempt(pathname)) return <>{children}</>;

  function enter() {
    if (!rememberAgeConfirmation(minimumAge) || !reloadForAgeGate()) setPassed(true);
  }

  if (left) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <h1 className="text-title-2 font-semibold text-fg">{t("state.ageGate.leftTitle")}</h1>
        <p className="text-body text-fg-muted">{t("state.ageGate.leftBody", { age: minimumAge })}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="age-gate-title"
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <h1 id="age-gate-title" className="text-title-2 font-semibold text-fg">
        {t("state.ageGate.title")}
      </h1>
      <p className="text-body text-fg-muted">{t("state.ageGate.body", { age: minimumAge })}</p>
      <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
        <Button size="lg" onClick={enter}>
          {t("state.ageGate.enter", { age: minimumAge })}
        </Button>
        <Button size="lg" variant="tonal" onClick={() => setLeft(true)}>
          {t("state.ageGate.leave")}
        </Button>
      </div>
      <p className="text-footnote text-fg-muted">
        {t("state.ageGate.members")} <TextLink href="/login">{t("state.ageGate.signIn")}</TextLink>
        {" · "}
        <TextLink href="/about">{t("state.ageGate.about")}</TextLink>
      </p>
    </section>
  );
}
