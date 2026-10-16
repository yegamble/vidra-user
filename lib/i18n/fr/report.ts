import type { Messages } from "../index";

export const report = {
  // ── machine-drafted, awaiting native-speaker review ──────────────────────
  "report.reasonLabel": "Motif du signalement",
  "report.reasonPlaceholder": "Pourquoi signalez-vous ce contenu\u00a0?",
  "report.submit": "Envoyer le signalement",
  "report.signedInThanks": "Merci — votre signalement a été transmis aux modérateurs.",
  "report.signInPrompt": "Connectez-vous pour signaler",
  "report.genericError": "Impossible d’envoyer votre signalement.",
  "report.title": "Signaler : {noun}",
  "report.categoriesLegend": "Quel est le problème ? (facultatif)",
  "report.timeLegend": "À quel moment de la vidéo ? (facultatif)",
  "report.timeStart": "Début (m:ss)",
  "report.timeEnd": "Fin (m:ss, facultatif)",
  "report.timeInvalid": "Utilisez une durée comme 90 ou 1:30.",
  "report.timeNeedStart": "Ajoutez aussi un début.",
  "report.timeOrder": "La fin doit être postérieure au début.",
} satisfies Messages;
