import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "./auth-store";
import { authApi, oauthBeginUrl } from "./auth";
import { ApiError, apiRequest } from "./client";

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "",
    bio: "",
    created_at: "2026-01-01T00:00:00Z",
  },
};

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("authApi + auth-store", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it("login POSTs credentials in cookie mode (cookie_mode: true, credentials included)", async () => {
    fetchMock.mockResolvedValue(okJson(session));
    const res = await authApi.login({ email: "ada@example.test", password: "pw" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ email: "ada@example.test", password: "pw", cookie_mode: true }),
    );
    expect(init.credentials).toBe("include");
    // Narrow the union: a non-MFA account gets the full session.
    if ("mfa_required" in res) throw new Error("expected a session, got an MFA challenge");
    expect(res.token).toBe("acc");
    expect(res.user.username).toBe("ada");
  });

  it("register POSTs to the register endpoint in cookie mode", async () => {
    fetchMock.mockResolvedValue(okJson(session));
    await authApi.register({ username: "ada", email: "ada@example.test", password: "password1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/register");
    expect((JSON.parse(init.body as string) as { cookie_mode: boolean }).cookie_mode).toBe(true);
    expect(init.credentials).toBe("include");
  });

  it("register surfaces the 202 pending-approval body instead of a session", async () => {
    fetchMock.mockResolvedValue(okJson({ status: "pending" }, 202));
    const res = await authApi.register({
      username: "ada",
      email: "ada@example.test",
      password: "password1",
      note: "hi admins",
    });
    expect(res).toEqual({ status: "pending" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).note).toBe("hi admins");
  });

  it("auto-attaches the stored access token to subsequent calls (cookie-free)", async () => {
    setAccessToken("acc");
    fetchMock.mockResolvedValue(okJson(session.user));
    await authApi.me();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/me");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer acc");
    // Only the session endpoints opt into cookies; /me and everything else
    // must never send credentials.
    expect(init.credentials).toBeUndefined();
  });

  it("sends no auth header when no token is stored", async () => {
    fetchMock.mockResolvedValue(okJson({}));
    await apiRequest("/api/v1/instance");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("requestPasswordReset POSTs the email to the reset endpoint", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    await authApi.requestPasswordReset({ email: "ada@example.test" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/password-reset");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "ada@example.test" }));
  });

  it("confirmPasswordReset POSTs the token and new password", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.confirmPasswordReset({ token: "tok-123", password: "newpassword-2" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/password-reset/confirm");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ token: "tok-123", password: "newpassword-2" }));
  });

  it("requestEmailVerification POSTs to the verify-email endpoint", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    await authApi.requestEmailVerification();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/verify-email");
    expect(init.method).toBe("POST");
  });

  it("confirmEmailVerification POSTs the token to the confirm endpoint", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.confirmEmailVerification({ token: "verify-tok" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/verify-email/confirm");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ token: "verify-tok" }));
  });

  it("logout posts with credentials and no body token (the cookie carries it)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.logout();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/logout");
    expect(init.body).toBe("{}");
    expect(init.credentials).toBe("include");
  });

  it("setAccessToken/getAccessToken round-trip", () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken("x");
    expect(getAccessToken()).toBe("x");
  });

  it("login surfaces an MFA challenge body instead of a session", async () => {
    fetchMock.mockResolvedValue(okJson({ mfa_required: true, mfa_token: "mfa-tok" }));
    const res = await authApi.login({ email: "ada@example.test", password: "pw" });
    expect(res).toEqual({ mfa_required: true, mfa_token: "mfa-tok" });
  });

  it("completeMFAChallenge POSTs the mfa_token and code in cookie mode, no 401 retry", async () => {
    fetchMock.mockResolvedValue(okJson(session));
    const res = await authApi.completeMFAChallenge("mfa-tok", "123456");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/mfa/challenge");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ mfa_token: "mfa-tok", code: "123456", cookie_mode: true }),
    );
    expect(init.credentials).toBe("include");
    expect(res.token).toBe("acc");
  });

  it("a 401 on the MFA challenge is a real answer (single request, rethrown)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthorized", message: "bad code" } }), {
        status: 401,
      }),
    );
    await expect(authApi.completeMFAChallenge("mfa-tok", "000000")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getMFAStatus GETs the mfa status endpoint with the bearer token", async () => {
    setAccessToken("acc");
    fetchMock.mockResolvedValue(okJson({ enabled: true, recovery_codes_remaining: 7 }));
    const res = await authApi.getMFAStatus();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/mfa");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer acc");
    expect(res).toEqual({ enabled: true, recovery_codes_remaining: 7 });
  });

  it("beginTOTPEnrollment POSTs and returns the one-time secret + otpauth URI", async () => {
    fetchMock.mockResolvedValue(okJson({ secret: "JBSWY3DP", otpauth_uri: "otpauth://totp/x" }));
    const res = await authApi.beginTOTPEnrollment();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/mfa/totp");
    expect(init.method).toBe("POST");
    expect(res.otpauth_uri).toBe("otpauth://totp/x");
  });

  it("verifyTOTPEnrollment POSTs the code and returns the recovery codes", async () => {
    fetchMock.mockResolvedValue(okJson({ recovery_codes: ["a1b2c-3d4e5"] }));
    const res = await authApi.verifyTOTPEnrollment("123456");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/mfa/totp/verify");
    expect(init.body).toBe(JSON.stringify({ code: "123456" }));
    expect(res.recovery_codes).toEqual(["a1b2c-3d4e5"]);
  });

  it("disableTOTP DELETEs with the password confirmation in the body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.disableTOTP("supersecret");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/mfa/totp");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe(JSON.stringify({ password: "supersecret" }));
  });

  it("listOAuthIdentities GETs the linked identities", async () => {
    fetchMock.mockResolvedValue(
      okJson({ identities: [{ provider: "google", email: "a@b.c", created_at: "2026-01-01" }] }),
    );
    const res = await authApi.listOAuthIdentities();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/oauth-identities");
    expect(res.identities[0].provider).toBe("google");
  });

  it("unlinkOAuthIdentity DELETEs the provider path (encoded)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.unlinkOAuthIdentity("goo gle");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/oauth-identities/goo%20gle");
    expect(init.method).toBe("DELETE");
  });

  it("a 422 unlink (last sign-in method) surfaces as an ApiError with the status", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "unprocessable_entity", message: "cannot remove the last sign-in method" },
        }),
        { status: 422 },
      ),
    );
    const err = await authApi.unlinkOAuthIdentity("google").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
  });

  it("oauthBeginUrl points at the begin endpoint, with an encoded return_to when given", () => {
    expect(oauthBeginUrl("google")).toBe("http://localhost:8080/api/v1/auth/oauth/google");
    expect(oauthBeginUrl("google", "/login?oauth=1")).toBe(
      "http://localhost:8080/api/v1/auth/oauth/google?return_to=%2Flogin%3Foauth%3D1",
    );
  });

  it("deleteAccount DELETEs /auth/me with the password confirmation in the body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.deleteAccount("supersecret");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/auth/me");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe(JSON.stringify({ password: "supersecret" }));
  });

  it("a 403 on deleteAccount (wrong password) surfaces as an ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "forbidden", message: "incorrect password" } }), {
        status: 403,
      }),
    );
    await expect(authApi.deleteAccount("nope")).rejects.toMatchObject({ status: 403 });
  });

  const exportStatus = {
    id: "e1",
    state: "pending",
    download_ready: false,
    requested_at: "2026-07-03T00:00:00Z",
    expires_at: null,
  };

  it("getAccountExport GETs the export status with the bearer token", async () => {
    setAccessToken("acc");
    fetchMock.mockResolvedValue(okJson(exportStatus));
    const res = await authApi.getAccountExport();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/export");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer acc");
    expect(res.state).toBe("pending");
  });

  it("requestAccountExport POSTs and parses the 202 status body", async () => {
    fetchMock.mockResolvedValue(okJson(exportStatus, 202));
    const res = await authApi.requestAccountExport();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/export");
    expect(init.method).toBe("POST");
    expect(res).toEqual(exportStatus);
  });

  it("downloadAccountExport GETs the archive body", async () => {
    const archive = {
      vidra_export: { version: 1, generated_at: "2026-07-03T00:00:00Z" },
      profile: {
        username: "ada",
        email: "ada@example.test",
        display_name: "",
        bio: "",
        unlisted: false,
        email_verified: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    };
    fetchMock.mockResolvedValue(okJson(archive));
    const res = await authApi.downloadAccountExport();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/export/download");
    expect(res.vidra_export.version).toBe(1);
    expect(res.profile.username).toBe("ada");
  });

  it("importAccountArchive POSTs the archive and returns the summary", async () => {
    const summary = {
      profile_applied: true,
      playlists_created: 1,
      playlist_items_added: 2,
      playlist_items_skipped: 0,
      follows_created: 3,
      follows_skipped: 1,
      notification_prefs_applied: 4,
      notification_prefs_skipped: 0,
      skipped_sections: { videos: 5 },
    };
    fetchMock.mockResolvedValue(okJson(summary));
    const archive = {
      vidra_export: { version: 1, generated_at: "2026-07-03T00:00:00Z" },
      profile: {
        username: "ada",
        email: "ada@example.test",
        display_name: "Ada",
        bio: "",
        unlisted: false,
        email_verified: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    };
    const res = await authApi.importAccountArchive(archive);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/import");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(archive);
    expect(res).toEqual(summary);
  });
});
