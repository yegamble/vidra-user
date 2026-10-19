import { afterEach, expect, it } from "vitest";
import { captureE2EESession, setE2EEUser } from "./session";

afterEach(() => setE2EEUser(null));

it("invalidates captured work on logout and account changes, while retaining token refreshes", () => {
  expect(() => captureE2EESession()).toThrow();
  setE2EEUser("a");
  const a = captureE2EESession();
  setE2EEUser("a");
  expect(() => a.assertCurrent()).not.toThrow();
  setE2EEUser("b");
  expect(() => a.assertCurrent()).toThrow();
  const b = captureE2EESession();
  setE2EEUser(null);
  setE2EEUser("b");
  expect(() => b.assertCurrent()).toThrow();
});
