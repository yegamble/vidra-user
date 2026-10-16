"use client";

import { useT } from "@/components/I18nProvider";
import type { SensitiveFlag } from "@/lib/api";
import { SENSITIVE_FLAGS } from "@/lib/sensitive-flags";
import { Checkbox } from "@/components/ui/Checkbox";

/**
 * SensitiveFlagsField lets a creator say WHICH kind of sensitive content a video
 * holds (violent, shocking, sexual). Viewers can set a different policy per
 * kind (Settings -> Sensitive content), so ticking the right kinds is what lets
 * someone who minds violence but not nudity filter accordingly. Shared by the
 * upload form and the Studio edit row; the parent keeps "Contains sensitive
 * content" on while any kind is ticked (core treats a flag as implying it).
 */
export function SensitiveFlagsField({
  value,
  onChange,
  disabled,
}: {
  value: SensitiveFlag[];
  onChange: (next: SensitiveFlag[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  function toggle(flag: SensitiveFlag, on: boolean) {
    const next = on ? [...value, flag] : value.filter((f) => f !== flag);
    // Canonical order, so the saved set never depends on tick order.
    onChange(SENSITIVE_FLAGS.map((f) => f.value).filter((f) => next.includes(f)));
  }
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="text-sm font-medium text-fg">{t("studio.sensitive.legend")}</legend>
      {SENSITIVE_FLAGS.map((f) => (
        <Checkbox
          key={f.value}
          checked={value.includes(f.value)}
          onChange={(e) => toggle(f.value, e.target.checked)}
          label={
            <>
              {f.label} <span className="text-xs text-fg-muted">{f.hint}</span>
            </>
          }
        />
      ))}
    </fieldset>
  );
}
