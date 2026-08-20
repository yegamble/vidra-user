import { describe, expect, it } from "vitest";

import {
  isOwnerClaimPending,
  OWNER_CLAIM_FROM_SIGNUP,
  OWNER_CLAIM_LOG_COMMAND,
  OWNER_CLAIM_PATH,
} from "@/lib/owner-claim";

describe("isOwnerClaimPending", () => {
  it("is true only when the server explicitly says it is waiting", () => {
    expect(isOwnerClaimPending({ owner_claim_pending: true })).toBe(true);
  });

  it("is false once the claim has landed", () => {
    expect(isOwnerClaimPending({ owner_claim_pending: false })).toBe(false);
  });

  it.each([
    ["an unreadable instance document", null],
    ["no instance document at all", undefined],
    ["a backend that predates the field", {}],
  ])("never invents a first-run state from %s", (_label, instance) => {
    expect(isOwnerClaimPending(instance)).toBe(false);
  });
});

describe("owner-claim constants", () => {
  it("keeps the wizard's signup entry pointed at the wizard", () => {
    expect(OWNER_CLAIM_FROM_SIGNUP.startsWith(`${OWNER_CLAIM_PATH}?`)).toBe(true);
  });

  it("hands over a command that reads the newest token, not a stale one", () => {
    expect(OWNER_CLAIM_LOG_COMMAND).toContain("FIRST-RUN");
  });

  it("spells the log command in its production form, not the dev default", () => {
    // A bare `docker compose` on a Vidra host silently loads
    // docker-compose.override.yml — the DEV overlay — and reads the wrong
    // containers' logs. The displayed command names the prod files itself.
    expect(OWNER_CLAIM_LOG_COMMAND).toContain("-f docker-compose.yml");
    expect(OWNER_CLAIM_LOG_COMMAND).toContain("-f docker-compose.prod.yml");
    expect(OWNER_CLAIM_LOG_COMMAND).toContain("--env-file env/production.env");
    expect(OWNER_CLAIM_LOG_COMMAND).toContain("logs api");
  });
});
