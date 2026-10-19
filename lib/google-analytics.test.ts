// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { analyticsPage, syncGoogleAnalytics } from "./google-analytics";

function commands() {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}
function views() { return commands().filter((entry) => entry[0] === "event"); }
beforeEach(() => {
  syncGoogleAnalytics(null, "/", "nonce");
  document.querySelectorAll("script[data-vidra-analytics]").forEach((script) => script.remove());
  window.dataLayer = [];
});

describe("analytics page privacy", () => {
  it("maps public routes to static categories, dropping identifiers", () => {
    expect(analyticsPage("/videos/secret-id")).toBe("/videos");
    expect(analyticsPage("/channels/private-handle")).toBe("/channels");
    expect(analyticsPage("/search")).toBe("/search");
    expect(analyticsPage("/")).toBe("/");
  });
  it.each(["/messages/secret", "/admin", "/settings", "/login", "/embed/video", "/studio", "/unknown", "/videos/id/edit", "/search?token=secret"])("excludes %s", (path) => {
    expect(analyticsPage(path)).toBeNull();
  });
});

describe("GA4 transport", () => {
  it("loads nothing when disabled, invalid or private", () => {
    for (const id of [null, "G-X<script>", "UA-123"]) syncGoogleAnalytics(id, "/", "nonce");
    syncGoogleAnalytics("G-TEST1234", "/messages/private", "nonce");
    expect(document.querySelector("script[data-vidra-analytics]")).toBeNull();
    expect(views()).toEqual([]);
  });
  it("loads one nonced tag and sends only the latest sanitized view after load", () => {
    syncGoogleAnalytics("G-TEST1234", "/videos/one", "nonce");
    syncGoogleAnalytics("G-TEST1234", "/videos/two", "nonce");
    expect(views()).toEqual([]);
    const script = document.querySelector<HTMLScriptElement>("script[data-vidra-analytics]")!;
    expect(script.nonce).toBe("nonce");
    expect(script.referrerPolicy).toBe("no-referrer");
    script.dispatchEvent(new Event("load"));
    expect(views()).toEqual([["event", "page_view", { send_to: "G-TEST1234", page_location: `${location.origin}/videos`, page_title: "Videos", page_referrer: "" }]]);
    syncGoogleAnalytics("G-TEST1234", "/videos/two", "nonce");
    expect(views()).toHaveLength(1);
    syncGoogleAnalytics("G-TEST1234", "/videos/three", "nonce");
    expect(views()).toHaveLength(2);
    expect(document.querySelectorAll("script[data-vidra-analytics]")).toHaveLength(1);
    expect(commands()).toContainEqual(["config", "G-TEST1234", expect.objectContaining({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false })]);
  });
  it("cancels a pending visit on withdrawal and resumes after a private route", () => {
    syncGoogleAnalytics("G-OTHER123", "/", "nonce");
    const script = document.querySelector("script[data-vidra-analytics]")!;
    syncGoogleAnalytics(null, "/", "nonce");
    script.dispatchEvent(new Event("load"));
    expect(views()).toEqual([]);
    expect(window["ga-disable-G-OTHER123"]).toBe(true);
    syncGoogleAnalytics("G-OTHER123", "/", "nonce");
    syncGoogleAnalytics("G-OTHER123", "/messages/secret", "nonce");
    syncGoogleAnalytics("G-OTHER123", "/", "nonce");
    expect(views()).toHaveLength(2);
    expect(JSON.stringify(commands())).not.toContain("secret");
  });
  it("ignores stale ID callbacks and tolerates a blocked tag", () => {
    syncGoogleAnalytics("G-OLD1234", "/", "nonce");
    const old = document.querySelector("script[data-vidra-analytics='G-OLD1234']")!;
    syncGoogleAnalytics("G-NEW1234", "/search", "nonce");
    expect(commands().filter((entry) => entry[0] === "consent").slice(-1)).toEqual([["consent", "update", { analytics_storage: "granted" }]]);
    old.dispatchEvent(new Event("load"));
    expect(views()).toEqual([]);
    const current = document.querySelector("script[data-vidra-analytics='G-NEW1234']")!;
    expect(() => current.dispatchEvent(new Event("error"))).not.toThrow();
    expect(window["ga-disable-G-OLD1234"]).toBe(true);
    expect(views()).toEqual([]);
  });
});
