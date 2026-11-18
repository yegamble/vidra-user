import type { Messages } from "../index";

export const state = {
  // ── machine-drafted, awaiting native-speaker review ──────────────────────
  "state.errorTitle": "Une erreur est survenue",
  "state.errorBody": "Une erreur inattendue s’est produite lors de l’affichage de cette page.",
  "state.notFoundTitle": "Page introuvable",
  "state.notFoundBody": "La page que vous cherchez n’existe pas ou a peut-être été déplacée.",
  "state.notFoundHome": "Retour à l’accueil",
  "state.ageGate.title": "Confirmez votre âge",
  "state.ageGate.body": "Ce site est réservé aux personnes âgées de {age} ans ou plus.",
  "state.ageGate.enter": "J’ai {age} ans ou plus",
  "state.ageGate.leave": "Quitter",
  "state.ageGate.members": "Les membres connectés passent cette étape.",
  "state.ageGate.signIn": "Se connecter",
  "state.ageGate.about": "À propos de ce site",
  "state.ageGate.leftTitle": "Vous avez choisi de quitter le site",
  "state.ageGate.leftBody": "Ce site est réservé aux personnes âgées de {age} ans ou plus. Vous pouvez fermer cette page.",
} satisfies Messages;
