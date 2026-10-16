import type { Messages } from "../index";

export const auth = {
  // ── machine-drafted, awaiting native-speaker review ──────────────────────
  "auth.oauth.notConfigured": "La connexion avec un fournisseur n’est pas activée sur ce serveur. Connectez-vous avec votre mot de passe ou contactez l’administrateur du serveur.",
  "auth.oauth.exchangeFailed": "Le fournisseur n’a pas terminé la connexion ; aucune session n’a été créée. Recommencez la connexion ou utilisez votre mot de passe.",
  "auth.oauth.signupDisabled": "Ce fournisseur permet uniquement de se connecter aux comptes déjà associés et ne peut pas créer de nouveau compte ici. Connectez-vous avec votre compte existant, puis associez ce fournisseur dans Réglages › Connexions associées.",
  "auth.oauth.emailDomainNotAllowed": "Pour créer un compte avec ce fournisseur, vous devez avoir une adresse e-mail vérifiée appartenant à un domaine autorisé par ce serveur. Utilisez un compte avec une adresse e-mail autorisée ou contactez l’administrateur du serveur.",
  "auth.email": "E-mail",
  "auth.password": "Mot de passe",
  "auth.signIn": "Se connecter",
  "auth.signingIn": "Connexion…",
} satisfies Messages;
