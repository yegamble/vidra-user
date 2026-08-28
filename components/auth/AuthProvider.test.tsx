// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken, setSessionExpiredHandler } from "@/lib/api/auth-store";

import { AuthProvider, useSession } from "./AuthProvider";

const user = {
  id: "u1",
  username: "ada",
  email: "ada@example.test",
  role: "user",
  email_verified: true,
  display_name: "",
  bio: "",
  created_at: "2026-01-01T00:00:00Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sessionJson(token: string, expiresIn = 900): unknown {
  return { token, token_type: "Bearer", expires_in: expiresIn, user };
}

function unauthorized(): Response {
  return jsonResponse({ error: { code: "unauthorized", message: "no session" } }, 401);
}

async function settlePromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function Probe() {
  const session = useSession();
  return (
    <>
      <div data-testid="status">{session.status}</div>
      <button
        type="button"
        onClick={() => {
          void session.login({ email: "ada@example.test", password: "supersecret" });
        }}
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={() => {
          void session.login({ identifier: "ada", password: "supersecret" });
        }}
      >
        Sign in by username
      </button>
    </>
  );
}

describe("AuthProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken(null);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
    setAccessToken(null);
  });

  it("proactively refreshes a signed-in session before the access token expires", async () => {
    let cookieSet = false;
    const refreshBodies: unknown[] = [];

    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/v1/auth/refresh") {
        refreshBodies.push(JSON.parse(String(init.body ?? "{}")));
        return Promise.resolve(cookieSet ? jsonResponse(sessionJson("acc2")) : unauthorized());
      }
      if (path === "/api/v1/auth/login") {
        cookieSet = true;
        return Promise.resolve(jsonResponse(sessionJson("acc1", 2)));
      }
      return Promise.resolve(jsonResponse(user));
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await settlePromises();
    expect(screen.getByTestId("status").textContent).toBe("anon");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    });
    await settlePromises();
    expect(screen.getByTestId("status").textContent).toBe("authed");
    expect(getAccessToken()).toBe("acc1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await settlePromises();
    expect(getAccessToken()).toBe("acc2");
    expect(refreshBodies.at(-1)).toEqual({ cookie_mode: true });
  });

  // Both login request shapes reach the wire unmodified: the provider is a
  // pass-through, so whichever identifier field the form chose is the one the
  // backend sees. Sending both would be a 422.
  it.each([
    ["Sign in", { email: "ada@example.test", password: "supersecret", cookie_mode: true }],
    ["Sign in by username", { identifier: "ada", password: "supersecret", cookie_mode: true }],
  ])("forwards the %s credentials verbatim", async (buttonName, expectedBody) => {
    const loginBodies: unknown[] = [];
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/v1/auth/login") {
        loginBodies.push(JSON.parse(String(init.body ?? "{}")));
        return Promise.resolve(jsonResponse(sessionJson("acc1")));
      }
      return Promise.resolve(unauthorized());
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await settlePromises();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: buttonName }));
    });
    await settlePromises();

    expect(screen.getByTestId("status").textContent).toBe("authed");
    expect(loginBodies).toEqual([expectedBody]);
  });
});
