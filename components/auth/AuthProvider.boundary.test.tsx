// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useSession } from "@/components/auth/AuthProvider";
import { apiRequest, restoreSession } from "@/lib/api/client";
import { getAccessToken, setAccessToken, setSessionExpiredHandler } from "@/lib/api/auth-store";
import { captureE2EESession, setE2EEUser } from "@/lib/e2ee/session";

const userA = { id: "synthetic-account-a", username: "a", email: "a@example.test", role: "user", email_verified: true, display_name: "", bio: "", created_at: "2026-01-01T00:00:00Z" };
const userB = { ...userA, id: "synthetic-account-b", username: "b" };
const session = (user: typeof userA, token: string) => ({ token, token_type: "Bearer", expires_in: 3600, user });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); setAccessToken(null); setE2EEUser(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSessionExpiredHandler(null); setAccessToken(null); setE2EEUser(null); });

it("keeps account B's bearer when an account A refresh completes late", async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  fetchMock.mockImplementationOnce(() => pending).mockResolvedValue(json({ devices: [] }));
  setAccessToken("synthetic-a-before"); setE2EEUser(userA.id);
  const refreshing = restoreSession();
  setAccessToken("synthetic-b-current"); setE2EEUser(userB.id);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  const operationB = captureE2EESession();
  finish(json(session(userA, "synthetic-a-late")));
  await refreshing;
  operationB.assertCurrent();
  await apiRequest("/api/v1/e2ee/devices", { retryOn401: false });
  const sent = fetchMock.mock.calls.at(-1)![1].headers.authorization;
  expect({ activeToken: getAccessToken(), sent }).toEqual({ activeToken: "synthetic-b-current", sent: "Bearer synthetic-b-current" });
});

it("shares refresh work only within the current session", async () => {
  let finishA!: (response: Response) => void;
  let finishB!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishA = resolve; }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishB = resolve; }));
  setAccessToken("synthetic-a-before");
  const old = restoreSession();
  setAccessToken("synthetic-b-current");
  const current = restoreSession();
  expect(current).not.toBe(old);
  finishA(json(session(userA, "synthetic-a-late")));
  await expect(old).resolves.toBeNull();
  expect(restoreSession()).toBe(current);
  finishB(json(session(userB, "synthetic-b-refreshed")));
  await current;
  expect(getAccessToken()).toBe("synthetic-b-refreshed");
});

it("does not replay an account A request after account B signs in before its delayed 401", async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  fetchMock.mockImplementationOnce(() => pending)
    .mockResolvedValueOnce(json(session(userB, "synthetic-b-refreshed")))
    .mockResolvedValueOnce(json({ accepted: true }));
  setAccessToken("synthetic-a-before");
  const request = apiRequest("/api/v1/test-write", { method: "POST", body: { synthetic: true } });
  setAccessToken("synthetic-b-current");
  finish(json({ error: { code: "unauthorized", message: "synthetic stale token" } }, 401));
  const outcome = await request.then(() => "replayed", () => "rejected");
  expect({ outcome, requests: fetchMock.mock.calls.length }).toEqual({ outcome: "rejected", requests: 1 });
});

it("does not expire account B when an account A refresh fails late", async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  const expired = vi.fn();
  setSessionExpiredHandler(expired);
  fetchMock.mockResolvedValueOnce(json({ error: { code: "unauthorized", message: "synthetic stale token" } }, 401))
    .mockImplementationOnce(() => pending);
  setAccessToken("synthetic-a-before");
  const request = apiRequest("/api/v1/test-write", { method: "POST", body: { synthetic: true } }).catch(() => undefined);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  setAccessToken("synthetic-b-current");
  finish(json({ error: { code: "unauthorized", message: "synthetic dead cookie" } }, 401));
  await request;
  expect({ activeToken: getAccessToken(), expired: expired.mock.calls.length }).toEqual({ activeToken: "synthetic-b-current", expired: 0 });
});

function Probe() {
  const { user, status, login, logout } = useSession();
  return <><p data-testid="user">{user?.id ?? "none"}</p><p data-testid="status">{status}</p><button onClick={() => { void login({ identifier: "b", password: "synthetic" }); }}>Sign in B</button><button onClick={() => { void logout(); }}>Sign out</button></>;
}

it.each(["refresh", "me", "me-failure"])("keeps account B when boot-time account A %s completes late", async (stage) => {
  let finish!: (response: Response) => void;
  const pendingMe = new Promise<Response>((resolve) => { finish = resolve; });
  fetchMock.mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/auth/refresh")) return stage === "refresh" ? pendingMe : Promise.resolve(json(session(userA, "synthetic-a-boot")));
    if (path.endsWith("/auth/me")) return stage === "refresh" ? Promise.resolve(json(userA)) : pendingMe;
    if (path.endsWith("/auth/login")) return Promise.resolve(json(session(userB, "synthetic-b-current")));
    if (path.endsWith("/auth/logout")) return Promise.resolve(new Response(null, { status: 204 }));
    throw new Error(`unexpected request ${path}`);
  });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/auth/${stage === "refresh" ? "refresh" : "me"}`))).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Sign in B" }));
  await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(userB.id));
  await act(async () => { finish(stage === "refresh" ? json(session(userA, "synthetic-a-boot")) : json(userA, stage === "me-failure" ? 500 : 200)); await pendingMe; });
  expect({ displayedUser: screen.getByTestId("user").textContent, e2eeUser: captureE2EESession().userId, token: getAccessToken() }).toEqual({ displayedUser: userB.id, e2eeUser: userB.id, token: "synthetic-b-current" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("anon"));
});
