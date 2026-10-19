// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { analytics as french } from "@/lib/i18n/fr/analytics";
import { AnalyticsConsent, type AnalyticsChoice } from "./AnalyticsConsent";

afterEach(cleanup);
it("explains optional Google Analytics cookies and offers equally prominent choices without opting in", () => {
  const onChange = vi.fn();
  render(<AnalyticsConsent choice={null} onChange={onChange} />);
  expect(screen.getByRole("region", { name: "Optional analytics" })).toBeTruthy();
  expect(screen.getByText(/Google Analytics uses cookies/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Accept" }).className).toBe(screen.getByRole("button", { name: "Decline" }).className);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
it.each([["Accept", "granted"], ["Decline", "denied"]] as const)("reports an explicit %s choice", (label, choice) => {
  const onChange = vi.fn(); render(<AnalyticsConsent choice={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(choice);
});
it.each(["granted", "denied"] as const)("reopens a saved %s preference and allows changing or withdrawing it", choice => {
  const onChange = vi.fn();
  const { rerender } = render(<AnalyticsConsent choice={choice} onChange={onChange} />);
  expect(screen.queryByRole("region", { name: "Optional analytics" })).toBeNull();
  const trigger = screen.getByRole("button", { name: "Analytics preferences" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false"); fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText(choice === "granted" ? "Analytics is currently on." : "Analytics is currently off.")).toBeTruthy();
  const next: AnalyticsChoice = choice === "granted" ? "denied" : "granted";
  fireEvent.click(screen.getByRole("button", { name: next === "granted" ? "Accept" : "Decline" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(next);
  rerender(<AnalyticsConsent choice={next} onChange={onChange} />);
  expect(screen.queryByRole("region", { name: "Optional analytics" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Analytics preferences" }));
});
it("closes reopened preferences without changing the saved choice", () => {
  const onChange = vi.fn(); render(<AnalyticsConsent choice="denied" onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: "Analytics preferences" });
  fireEvent.click(trigger); fireEvent.click(trigger);
  expect(screen.queryByRole("region")).toBeNull(); expect(onChange).not.toHaveBeenCalled();
});
it("renders its initial choice safely on the server", () => {
  const html = renderToString(<AnalyticsConsent choice={null} onChange={() => {}} />);
  expect(html).toContain("Optional analytics"); expect(html).toContain("Accept"); expect(html).toContain("Decline");
});
it("uses the active French locale for the panel and preference control", () => {
  render(<I18nProvider locale="fr" messages={french}><AnalyticsConsent choice="denied" onChange={() => {}} /></I18nProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Préférences de statistiques" }));
  expect(screen.getByRole("region", { name: "Statistiques facultatives" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Accepter" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Refuser" })).toBeTruthy();
});
