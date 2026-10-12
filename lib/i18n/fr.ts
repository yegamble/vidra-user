import type { Messages } from "./index";

/**
 * French — a SEED proving the pipeline (LOCALES marks it partial, so only a
 * viewer who picks French sees it); a key missing here renders the English.
 *
 * REVIEW STATUS: every string under the "machine-drafted" rule was drafted by
 * an AI model (2026-10-12) and has not been read by a native speaker. A
 * reviewer moves each string they approve ABOVE that rule.
 */
export const fr = {
  // ── machine-drafted, awaiting native-speaker review ──────────────────────
  "common.close": "Fermer",
  "common.cancel": "Annuler",
  "common.loading": "Chargement",
  "common.dismiss": "Ignorer",
  "common.retry": "Réessayer",
  "a11y.skipToContent": "Aller au contenu",
  "state.errorTitle": "Une erreur est survenue",
  "state.notFoundTitle": "Page introuvable",
  "state.notFoundBody": "La page que vous cherchez n’existe pas ou a peut-être été déplacée.",
  "state.notFoundHome": "Retour à l’accueil",
  "search.suggestions": { one: "{count} suggestion disponible", other: "{count} suggestions disponibles" },
} satisfies Messages;
