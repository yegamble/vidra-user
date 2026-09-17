import { expect, test } from "@playwright/test";

const watchPath = "/videos/v1?t=17&from=library#comments";
const user = {
  id: "u1", username: "ada", email: "ada@example.test", role: "user",
  email_verified: true, display_name: "Ada", bio: "", created_at: "2026-09-17T00:00:00Z",
};
const session = { token: "synthetic-access", token_type: "Bearer", expires_in: 900, user };
const video = {
  id: "v1", channel_id: "c1", channel_handle: "films", channel_display_name: "Film House",
  title: "Watch return regression", description: "Synthetic authentication fixture.",
  privacy: "public", state: "published", created_at: user.created_at,
  views: 0, has_thumbnail: false, duration_seconds: 60,
};

for (const mfa of [false, true]) {
  test(`${mfa ? "MFA" : "password"} sign-in returns to the cached watch URL with one fragment and no action replay`, async ({ context, page }) => {
    let signedIn = false;
    let restoredAfterLogin = 0;
    const protectedWrites: string[] = [];
    await context.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        "access-control-allow-origin": request.headers().origin || new URL(page.url()).origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": request.headers()["access-control-request-headers"] || "Content-Type, Authorization, X-Correlation-ID",
        "access-control-allow-methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
      };
      const json = (body: unknown, status = 200) => route.fulfill({ status, headers, json: body });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (!["GET", "HEAD"].includes(request.method()) && /\/(rating|save|follow|reports?|comments|playlists)(\/|$)/.test(path)) {
        protectedWrites.push(`${request.method()} ${path}`);
      }
      if (path === "/api/v1/auth/login") {
        expect(request.postDataJSON()).toEqual({ identifier: "ada", password: "synthetic-password", cookie_mode: true });
        if (mfa) return json({ mfa_required: true, mfa_token: "synthetic-challenge" });
        signedIn = true;
        return json(session);
      }
      if (path === "/api/v1/auth/mfa/challenge") {
        expect(request.postDataJSON()).toEqual({ mfa_token: "synthetic-challenge", code: "a1b2c-3d4e5", cookie_mode: true });
        signedIn = true;
        return json(session);
      }
      // The document reload restores the cookie-mode session; an in-memory
      // login response alone must not make this navigation regression pass.
      if (path === "/api/v1/auth/refresh" && signedIn) {
        restoredAfterLogin++;
        return json(session);
      }
      if (path === "/api/v1/auth/me" && signedIn) return json(user);
      if (path.includes("/auth/")) return json({ error: { code: "unauthorized", message: "Signed out" } }, 401);
      if (path === "/api/v1/instance") return json({ name: "Vidra", oauth_providers: [], atproto_login: false, features: {} });
      if (path === "/api/v1/videos/v1") return json(video);
      if (path === "/api/v1/channels/films") return json({ id: "c1", handle: "films", display_name: "Film House", follower_count: 25, is_following: false });
      if (path.endsWith("/original")) return route.abort();
      if (path.endsWith("/playback-session")) return json({ session_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", video_id: "v1" });
      if (path.endsWith("/captions")) return json({ captions: [] });
      if (path.endsWith("/comments")) return json({ comments: [] });
      if (path.endsWith("/rating")) return json({ like_count: 0, dislike_count: 0, my_rating: null });
      if (path === "/api/v1/me/channels") return json({ channels: [] });
      if (path === "/api/v1/me/saved" || path.endsWith("/videos")) return json({ videos: [], total: 0 });
      if (!["GET", "HEAD"].includes(request.method())) return json({}, 202);
      return json({ error: { code: "not_found", message: "No fixture for optional endpoint" } }, 404);
    });

    // Initial hydration caches a canonical URL containing the fragment. A
    // return through the SPA cache previously appended that fragment twice.
    await page.goto(watchPath);
    const originalUrl = new URL(watchPath, page.url()).href;
    await expect(page.getByRole("heading", { name: video.title })).toBeVisible();
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    const prompt = page.getByRole("dialog", { name: "Sign in to follow this channel", exact: true });
    await expect(prompt.getByRole("link", { name: "Sign in", exact: true }))
      .toHaveAttribute("href", `/login?return_to=${encodeURIComponent(watchPath)}`);
    expect(protectedWrites).toEqual([]);
    await prompt.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email or username", { exact: true }).fill("ada");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    if (mfa) {
      await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);
      await page.getByRole("button", { name: "Use a recovery code instead" }).click();
      await page.getByLabel("Recovery code", { exact: true }).fill("a1b2c-3d4e5");
      await page.getByRole("button", { name: "Verify code", exact: true }).click();
    }
    await expect(page).toHaveURL(originalUrl);
    await expect(page.getByRole("heading", { name: video.title })).toBeVisible();
    await page.getByRole("button", { name: "Open account menu" }).click();
    await expect(page.getByRole("dialog", { name: "Account menu" }).getByText("@ada", { exact: true })).toBeVisible();
    expect(restoredAfterLogin).toBeGreaterThan(0);
    expect(protectedWrites).toEqual([]);
  });
}
