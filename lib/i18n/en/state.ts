export const state = {
  // App-shell states, surfaced through the shared primitives (Spinner,
  // ErrorState) so every loading/error surface in the app is externalized at
  // once. See .ralph/specs/design-system.md ("i18n coverage").
  "state.errorTitle": "Something went wrong",
  "state.errorBody": "An unexpected error occurred while showing this page.",
  "state.notFoundTitle": "Page not found",
  "state.notFoundBody": "The page you're looking for doesn't exist or may have been moved.",
  "state.notFoundHome": "Go home",
} as const;
