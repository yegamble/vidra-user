import type { Messages } from "../index";

export const state = {
  // ── machine-drafted, awaiting native-speaker review ──────────────────────
  "state.errorTitle": "Une erreur est survenue",
  "state.errorBody": "Une erreur inattendue s’est produite lors de l’affichage de cette page.",
  "state.notFoundTitle": "Page introuvable",
  "state.notFoundBody": "La page que vous cherchez n’existe pas ou a peut-être été déplacée.",
  "state.notFoundHome": "Retour à l’accueil",
} satisfies Messages;
