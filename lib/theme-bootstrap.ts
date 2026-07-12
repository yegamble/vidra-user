// Theme bootstrap seam (config-parity W2). This module is deliberately free of
// "use client" so the server root layout can import it directly: it owns the
// localStorage key and builds the inline pre-paint script that applies the
// theme before first paint (no flash). lib/theme.ts (the client-side store)
// imports THEME_STORAGE_KEY from here so the key can never drift.
//
// The builder accepts the instance's SSR default theme (GET /instance
// `defaults.theme`, see lib/instance-config.server.ts). Until W1 ships that
// block — or whenever a user has an explicit stored preference — the script
// behaves exactly like the pre-seam hardcoded bootstrap: stored "light"/"dark"
// pins <html data-theme>, anything else follows the OS.

export const THEME_STORAGE_KEY = "vidra.theme";

/**
 * Build the inline no-flash bootstrap script. `instanceDefault` is the
 * instance-configured default theme; only "light"/"dark" have any effect
 * ("system", undefined, or garbage all mean: follow the OS), and it only
 * applies when the visitor has no stored preference of their own. A stored
 * "system" IS a preference — an explicit "follow my OS" choice (written by
 * lib/theme.ts writeThemePreference) — so it skips the instance default;
 * only an absent/unknown value means "never chose".
 */
export function buildThemeBootstrapScript(instanceDefault?: string): string {
  const fallback =
    instanceDefault === "light" || instanceDefault === "dark" ? instanceDefault : null;
  return (
    `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(t!=="light"&&t!=="dark"&&t!=="system")t=${JSON.stringify(fallback)};` +
    `if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`
  );
}

/** The default bootstrap (no instance default) — today's exact behavior. */
export const THEME_BOOTSTRAP_SCRIPT = buildThemeBootstrapScript();
