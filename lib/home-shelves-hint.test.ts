// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOME_SHELVES_HINT_ATTRIBUTE,
  HOME_SHELVES_HINT_EVENT,
  HOME_SHELVES_HINT_STORAGE_KEY,
  buildHomeShelvesHintScript,
  readHomeShelvesHint,
  subscribeHomeShelvesHint,
  writeHomeShelvesHint,
} from "./home-shelves-hint";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(HOME_SHELVES_HINT_ATTRIBUTE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readHomeShelvesHint", () => {
  it("returns 0 when nothing is stored", () => {
    expect(readHomeShelvesHint()).toBe(0);
  });

  it("reads and clamps the stored count into 0..2", () => {
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, "1");
    expect(readHomeShelvesHint()).toBe(1);
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, "2");
    expect(readHomeShelvesHint()).toBe(2);
    // Out-of-range / garbage clamp to the nearest valid count.
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, "9");
    expect(readHomeShelvesHint()).toBe(2);
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, "-3");
    expect(readHomeShelvesHint()).toBe(0);
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, "nope");
    expect(readHomeShelvesHint()).toBe(0);
  });
});

describe("writeHomeShelvesHint", () => {
  it("persists the clamped count and mirrors it onto <html>", () => {
    writeHomeShelvesHint(2);
    expect(localStorage.getItem(HOME_SHELVES_HINT_STORAGE_KEY)).toBe("2");
    expect(document.documentElement.getAttribute(HOME_SHELVES_HINT_ATTRIBUTE)).toBe("2");

    writeHomeShelvesHint(5); // clamped to MAX_HOME_SHELVES
    expect(localStorage.getItem(HOME_SHELVES_HINT_STORAGE_KEY)).toBe("2");

    writeHomeShelvesHint(0);
    expect(localStorage.getItem(HOME_SHELVES_HINT_STORAGE_KEY)).toBe("0");
    expect(document.documentElement.getAttribute(HOME_SHELVES_HINT_ATTRIBUTE)).toBe("0");
  });

  it("dispatches the same-tab event so subscribers re-read", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeHomeShelvesHint(onChange);
    writeHomeShelvesHint(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeHomeShelvesHint(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("buildHomeShelvesHintScript", () => {
  it("stamps the stored count onto <html> when the inline script runs", () => {
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, "2");
    new Function(buildHomeShelvesHintScript())();
    expect(document.documentElement.getAttribute(HOME_SHELVES_HINT_ATTRIBUTE)).toBe("2");
  });

  it("leaves the attribute absent when nothing is stored", () => {
    new Function(buildHomeShelvesHintScript())();
    expect(document.documentElement.hasAttribute(HOME_SHELVES_HINT_ATTRIBUTE)).toBe(false);
  });

  it("references the storage key and attribute name", () => {
    const script = buildHomeShelvesHintScript();
    expect(script).toContain(HOME_SHELVES_HINT_STORAGE_KEY);
    expect(script).toContain(HOME_SHELVES_HINT_ATTRIBUTE);
  });

  it("exposes the event name used for same-tab coordination", () => {
    expect(HOME_SHELVES_HINT_EVENT).toBe("vidra:home-shelves-hint");
  });
});
