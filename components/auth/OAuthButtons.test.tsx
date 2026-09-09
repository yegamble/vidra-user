import { describe, expect, it } from "vitest";

import { oauthErrorMessage } from "@/components/auth/OAuthButtons";

// The callback's ?oauth_error=<code> is the only thing a refused provider
// sign-in leaves behind, so every code core can emit needs copy that says what
// happened AND what the person can do. A code with no case falls through to a
// generic "try again", which is wrong twice over for a policy refusal: trying
// again cannot work, and the reason is not a failure.
describe("oauthErrorMessage", () => {
  it("explains a signup refused because registration is closed", () => {
    const message = oauthErrorMessage("registration_closed");
    expect(message).not.toBe(oauthErrorMessage("some_code_that_does_not_exist"));
    expect(message).toMatch(/not (accepting|taking) new accounts|registration is closed|closed/i);
    // Never tell someone to retry something the policy forbids.
    expect(message).not.toMatch(/try again/i);
  });

  it("explains a signup queued for approval, and that no retry is needed", () => {
    const message = oauthErrorMessage("registration_pending");
    expect(message).not.toBe(oauthErrorMessage("some_code_that_does_not_exist"));
    expect(message).toMatch(/review|approv/i);
    expect(message).not.toMatch(/try again/i);
  });
});
