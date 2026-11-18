export const state = {
  // App-shell states, surfaced through the shared primitives (Spinner,
  // ErrorState) so every loading/error surface in the app is externalized at
  // once. See .ralph/specs/design-system.md ("i18n coverage").
  "state.errorTitle": "Something went wrong",
  "state.errorBody": "An unexpected error occurred while showing this page.",
  "state.notFoundTitle": "Page not found",
  "state.notFoundBody": "The page you're looking for doesn't exist or may have been moved.",
  "state.notFoundHome": "Go home",
  // The age gate (components/AgeGate.tsx): self-declared, never "verification".
  "state.ageGate.title": "Confirm your age",
  "state.ageGate.body": "This site is only for people aged {age} or older.",
  "state.ageGate.enter": "I am {age} or older",
  "state.ageGate.leave": "Leave",
  "state.ageGate.members": "Members who sign in skip this step.",
  "state.ageGate.signIn": "Sign in",
  "state.ageGate.about": "About this site",
  "state.ageGate.leftTitle": "You chose to leave",
  "state.ageGate.leftBody": "This site is only for people aged {age} or older. You can close this page.",
} as const;
