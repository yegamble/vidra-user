// WCAG contrast math for the theme_primary_color admin control and the
// runtime accent override (config-parity W6; waves.md architecture note 4's
// "immediate inline validation" + the wave's mandatory contrast validator).
//
// The design system's accent is theme-adaptive (--accent:
// light-dark(#18181b, #f4f4f5) in app/globals.css) with a paired --accent-fg
// for the text that sits ON the accent fill. An operator-picked primary color
// is ONE color for both themes, so two things need checking live in the
// editor:
//
//   1. The candidate against each theme's page canvas (#ffffff light,
//      #0a0a0a dark — the surfaces accent-filled controls sit on). Below
//      4.5:1 for a theme → a WARNING for that theme (never a block: the
//      operator may deliberately favor one theme).
//   2. The label color that will sit on the accent fill: we pick white or
//      near-black (#18181b, the token architecture's own dark ink),
//      whichever contrasts more — the same computed pair the runtime
//      override injects.
//
// Pure module: unit-testable, shared by the admin control (live warnings)
// and components/InstanceCustomization.tsx (the injected override).

/** The theme canvases the accent sits on (app/globals.css --canvas). */
export const LIGHT_THEME_SURFACE = "#ffffff";
export const DARK_THEME_SURFACE = "#0a0a0a";

/** WCAG AA threshold for normal text; the wave's warning line. */
export const WCAG_AA_CONTRAST = 4.5;

/** The two candidate label inks for text on the accent fill. */
const ACCENT_FG_LIGHT_INK = "#ffffff";
const ACCENT_FG_DARK_INK = "#18181b";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Strict #rrggbb check — the only shape ever injected into CSS. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

function hexChannel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

/** sRGB channel (0–255) → linear-light value, per WCAG 2.x. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a #rrggbb color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  return (
    0.2126 * linearize(hexChannel(hex, 0)) +
    0.7152 * linearize(hexChannel(hex, 1)) +
    0.0722 * linearize(hexChannel(hex, 2))
  );
}

/**
 * WCAG contrast ratio between two #rrggbb colors: 1 (identical) to 21
 * (black on white). Both inputs must be valid hex colors.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type PrimaryColorContrast = {
  /** Candidate vs the light theme's canvas (#ffffff). */
  light: number;
  /** Candidate vs the dark theme's canvas (#0a0a0a). */
  dark: number;
  /** Human warnings for every theme below 4.5:1 — empty when both pass. */
  warnings: string[];
};

/**
 * The live editor check: the candidate color against BOTH theme canvases.
 * Returns null for anything that is not a #rrggbb color (the hex validator
 * handles that error separately); "" (no override) is also null — nothing to
 * warn about.
 */
export function primaryColorContrast(candidate: string): PrimaryColorContrast | null {
  if (!isHexColor(candidate)) return null;
  const light = contrastRatio(candidate, LIGHT_THEME_SURFACE);
  const dark = contrastRatio(candidate, DARK_THEME_SURFACE);
  const warnings: string[] = [];
  if (light < WCAG_AA_CONTRAST) {
    warnings.push(
      `Low contrast in the light theme (${light.toFixed(1)}:1 against its background — WCAG AA needs 4.5:1).`,
    );
  }
  if (dark < WCAG_AA_CONTRAST) {
    warnings.push(
      `Low contrast in the dark theme (${dark.toFixed(1)}:1 against its background — WCAG AA needs 4.5:1).`,
    );
  }
  return { light, dark, warnings };
}

/**
 * The label ink for text sitting ON the accent fill: white or the token
 * architecture's near-black (#18181b), whichever contrasts more with the
 * picked color. Shared by the editor preview and the runtime override so
 * they can never disagree.
 */
export function accentForegroundFor(color: string): string {
  return contrastRatio(color, ACCENT_FG_LIGHT_INK) >= contrastRatio(color, ACCENT_FG_DARK_INK)
    ? ACCENT_FG_LIGHT_INK
    : ACCENT_FG_DARK_INK;
}

/**
 * The runtime override stylesheet for customization.primary_color: overrides
 * the --accent TOKEN (plus its paired --accent-fg), never individual rules,
 * so every bg-accent/text-accent-fg call site follows. Returns null for
 * anything that is not a strict #rrggbb color — a malformed backend value can
 * never inject CSS.
 */
export function buildAccentOverrideCss(color: string): string | null {
  if (!isHexColor(color)) return null;
  return `:root{--accent:${color.toLowerCase()};--accent-fg:${accentForegroundFor(color)};}`;
}
