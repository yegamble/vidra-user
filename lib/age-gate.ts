/**
 * The age gate (core `age_gate_enabled`): a visitor without an account confirms
 * they are at least the instance's minimum age before any page or embed shows.
 * Self-declared and enforced only here, in the frontend — the API refuses
 * nothing — so it is not age verification.
 *
 * The confirmation is a cookie the server layout reads, so the request after a
 * confirmation renders with the operator's custom script, ads and analytics,
 * which a gated request renders without. Its value is the age confirmed, so
 * raising the minimum age asks again.
 */
export const AGE_GATE_COOKIE = "vidra_age_ok";

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const RELOADED_KEY = "vidra_age_gate_reloaded";

type GateInstance = { age_gate_enabled?: boolean; registration_minimum_age?: number } | null | undefined;

/** The age a stored confirmation covers; 0 when there is none or it is malformed. */
export function confirmedAge(value: string | undefined): number {
  return value && /^\d{1,3}$/.test(value) ? Number(value) : 0;
}

/** The age the gate asks for on this instance; 0 when the gate is off. */
export function ageGateMinimum(instance: GateInstance): number {
  return instance?.age_gate_enabled === true ? Math.max(0, instance.registration_minimum_age ?? 0) : 0;
}

/** Whether a request carrying this cookie value must pass the gate first. */
export function ageGatePending(instance: GateInstance, cookieValue: string | undefined): boolean {
  const minimum = ageGateMinimum(instance);
  return minimum > 0 && confirmedAge(cookieValue) < minimum;
}

// Pages that show no catalogue: signing in passes the gate, and the about page
// carries the instance's terms.
const EXEMPT = ["/about", "/login", "/signup", "/reset-password", "/verify-email", "/email-change", "/setup"];

export function ageGateExempt(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXEMPT.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Stores the confirmation for 30 days and reports whether the browser kept it.
 * In a frame on another site (an embed) the cookie must be SameSite=None to be
 * sent at all, and Partitioned keeps it to that site's frames; a browser that
 * blocks it there drops it, and the caller shows the page for this view only.
 */
export function rememberAgeConfirmation(age: number): boolean {
  const attrs = window.location.protocol === "https:" ? "; Secure; SameSite=None; Partitioned" : "; SameSite=Lax";
  document.cookie = `${AGE_GATE_COOKIE}=${age}; Path=/; Max-Age=${MAX_AGE_SECONDS}${attrs}`;
  return document.cookie.split(/;\s*/).includes(`${AGE_GATE_COOKIE}=${age}`);
}

/**
 * Reloads once per tab so the server renders the page with what the gate held
 * back. False (no reload) when this tab already reloaded for the gate: a
 * server that still saw no confirmation must not loop.
 */
export function reloadForAgeGate(reload: () => void = () => window.location.reload()): boolean {
  try {
    if (window.sessionStorage.getItem(RELOADED_KEY) === "1") return false;
    window.sessionStorage.setItem(RELOADED_KEY, "1");
  } catch {
    return false;
  }
  reload();
  return true;
}

/** Called once a render is past the gate, so a later raise of the age may reload again. */
export function clearAgeGateReload(): void {
  try {
    window.sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}
