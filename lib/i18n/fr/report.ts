import type { Messages } from "../index";

export const report = {
  // ── machine-drafted, awaiting native-speaker review ──────────────────────
  // report.title stays English: it interpolates an English noun ("video"),
  // which needs one key per kind before it can be translated.
  "report.reasonLabel": "Motif du signalement",
  "report.reasonPlaceholder": "Pourquoi signalez-vous ce contenu\u00a0?",
  "report.submit": "Envoyer le signalement",
  "report.signedInThanks": "Merci — votre signalement a été transmis aux modérateurs.",
  "report.signInPrompt": "Connectez-vous pour signaler",
  "report.genericError": "Impossible d’envoyer votre signalement.",
} satisfies Messages;
