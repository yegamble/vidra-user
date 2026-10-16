export const auth = {
  // Auth surfaces.
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.oauth.notConfigured": "Provider sign-in is not enabled on this server. Sign in with your password, or contact the server administrator.",
  "auth.oauth.exchangeFailed": "The provider did not complete the sign-in, so no sign-in session was created. Start sign-in again, or use your password.",
  "auth.oauth.signupDisabled": "This provider only signs in accounts that are already connected and cannot create a new account here. Sign in with your existing account, then connect this provider from Settings › Connected logins.",
  "auth.oauth.emailDomainNotAllowed": "New accounts through this provider require a verified email address from a domain allowed by this server. Use an account with an allowed email address, or contact the server administrator.",
} as const;
