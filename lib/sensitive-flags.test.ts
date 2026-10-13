import { describe, expect, it } from "vitest";

import { resolveSensitivePolicy } from "./sensitive-flags";

// Mirrors vidra-core video.TestResolveSensitivePolicy: flags x overrides x base.
describe("resolveSensitivePolicy", () => {
  const sensitive = (...flags: ("violent" | "shocking" | "sex")[]) => ({
    is_sensitive: true,
    sensitive_flags: flags,
  });

  it("a video that is not sensitive always displays", () => {
    expect(resolveSensitivePolicy("hide", { violent: "hide" }, { is_sensitive: false })).toBe(
      "display",
    );
  });

  it("an unflagged sensitive video follows the base policy, ignoring overrides", () => {
    expect(resolveSensitivePolicy("blur", { violent: "hide" }, sensitive())).toBe("blur");
  });

  it("a flag without an override follows the base policy", () => {
    expect(resolveSensitivePolicy("warn", {}, sensitive("sex"))).toBe("warn");
  });

  it("an override loosens or tightens the base for its own flag", () => {
    expect(resolveSensitivePolicy("hide", { violent: "display" }, sensitive("violent"))).toBe(
      "display",
    );
    expect(resolveSensitivePolicy("display", { sex: "hide" }, sensitive("sex"))).toBe("hide");
  });

  it("several flags: the most restrictive applies", () => {
    expect(
      resolveSensitivePolicy("display", { violent: "blur", sex: "warn" }, sensitive("violent", "sex")),
    ).toBe("warn");
    // A flag with no override keeps the base in the mix.
    expect(
      resolveSensitivePolicy("hide", { violent: "display" }, sensitive("violent", "shocking")),
    ).toBe("hide");
  });

  it("an override for a flag the video lacks is inert", () => {
    expect(resolveSensitivePolicy("display", { sex: "hide" }, sensitive("violent"))).toBe("display");
  });

  it("an unknown base (still loading) means no client treatment", () => {
    expect(resolveSensitivePolicy(null, {}, sensitive("sex"))).toBeNull();
    expect(resolveSensitivePolicy(null, { sex: "blur" }, sensitive("sex"))).toBe("blur");
  });
});
