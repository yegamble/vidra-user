import { beforeEach, describe, expect, it } from "vitest";
import { setE2EEUser } from "./session";

import {
  __resetEncryptedDraftsForTest,
  discardEncryptedDraft,
  readEncryptedDraft,
  stashEncryptedDraft,
} from "./drafts";

describe("encrypted draft handoff", () => {
  beforeEach(() => __resetEncryptedDraftsForTest());

  it("preserves the exact draft for a one-time read", () => {
    stashEncryptedDraft("c1", "  meet at noon\n");

    expect(readEncryptedDraft("c1")).toBe("  meet at noon\n");
    discardEncryptedDraft("c1");
    expect(readEncryptedDraft("c1")).toBeUndefined();
  });

  it("keeps drafts isolated by conversation", () => {
    stashEncryptedDraft("c1", "first");
    stashEncryptedDraft("c2", "second");

    expect(readEncryptedDraft("c2")).toBe("second");
    expect(readEncryptedDraft("c1")).toBe("first");
  });

  it("clears plaintext handoffs when the signed-in account changes", () => {
    setE2EEUser("a");
    stashEncryptedDraft("c1", "private draft");
    setE2EEUser(null);
    setE2EEUser("b");
    expect(readEncryptedDraft("c1")).toBeUndefined();
    setE2EEUser(null);
  });
});
