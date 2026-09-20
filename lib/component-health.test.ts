import { describe, expect, it } from "vitest";
import { componentHealthPresentation } from "./component-health";

describe("shared health presentation", () => {
  it.each(["paused", "pending", "not_configured"])("keeps %s neutral on every health view", (status) => {
    expect(componentHealthPresentation(status)).toMatchObject({ neutral: true, fault: false });
  });
  it.each(["down", "degraded", "unknown_future_fault"])("does not hide %s", (status) => {
    expect(componentHealthPresentation(status)).toMatchObject({ neutral: false, fault: true });
  });
  it("reserves success for an affirmative health verdict", () => {
    expect(componentHealthPresentation("ok")).toEqual({ label: "OK", neutral: false, fault: false });
  });
});
