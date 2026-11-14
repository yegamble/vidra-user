// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGE_GATE_COOKIE,
  ageGateExempt,
  ageGateMinimum,
  ageGatePending,
  clearAgeGateReload,
  confirmedAge,
  rememberAgeConfirmation,
  reloadForAgeGate,
} from "./age-gate";

const gate = (age: number) => ({ age_gate_enabled: true, registration_minimum_age: age });

afterEach(() => {
  document.cookie = `${AGE_GATE_COOKIE}=; Path=/; Max-Age=0`;
  window.sessionStorage.clear();
});

describe("age gate", () => {
  it("reads only a plain age from the cookie", () => {
    expect(confirmedAge("18")).toBe(18);
    for (const bad of [undefined, "", "abc", "-1", "1000", "18; x"]) expect(confirmedAge(bad)).toBe(0);
  });

  it("asks only while the gate is on with an age, and until that age is confirmed", () => {
    expect(ageGateMinimum(null)).toBe(0);
    expect(ageGateMinimum({ age_gate_enabled: false, registration_minimum_age: 18 })).toBe(0);
    expect(ageGateMinimum(gate(18))).toBe(18);

    expect(ageGatePending(null, undefined)).toBe(false);
    expect(ageGatePending({ age_gate_enabled: false, registration_minimum_age: 18 }, undefined)).toBe(false);
    expect(ageGatePending(gate(0), undefined)).toBe(false);
    expect(ageGatePending(gate(18), undefined)).toBe(true);
    expect(ageGatePending(gate(18), "18")).toBe(false);
    expect(ageGatePending(gate(18), "21")).toBe(false);
    // The operator raised the age after this visitor confirmed: ask again.
    expect(ageGatePending(gate(18), "16")).toBe(true);
  });

  it("leaves the sign-in and about pages open, and nothing else", () => {
    for (const open of ["/login", "/signup", "/about", "/about/instance", "/reset-password", "/verify-email"]) {
      expect(ageGateExempt(open), open).toBe(true);
    }
    for (const gated of ["/", "/aboutus", "/videos/abc", "/embed/abc", "/w/abc", null]) {
      expect(ageGateExempt(gated), String(gated)).toBe(false);
    }
  });

  it("stores the confirmed age in a cookie the server can read", () => {
    expect(rememberAgeConfirmation(18)).toBe(true);
    expect(document.cookie).toContain(`${AGE_GATE_COOKIE}=18`);
  });

  it("reloads once per tab, so a server that still sees no confirmation cannot loop", () => {
    const reload = vi.fn();
    expect(reloadForAgeGate(reload)).toBe(true);
    expect(reloadForAgeGate(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    clearAgeGateReload();
    expect(reloadForAgeGate(reload)).toBe(true);
  });
});
