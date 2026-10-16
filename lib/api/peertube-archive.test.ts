import { afterEach, expect, it, vi } from "vitest";

import { authApi } from "./auth";
import { setAccessToken } from "./auth-store";

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

it("sends the original archive as authenticated multipart without setting its boundary", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ channels_created: 1 })));
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken("token");
  const file = new File(["PK archive bytes"], "export.zip", { type: "application/zip" });
  const controller = new AbortController();
  await authApi.importPeerTubeArchive(file, controller.signal);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://localhost:8080/api/v1/me/import/peertube");
  expect(init.method).toBe("POST");
  expect((init.body as FormData).get("archive")).toBe(file);
  expect(new Headers(init.headers).get("authorization")).toBe("Bearer token");
  expect(new Headers(init.headers).has("content-type")).toBe(false);
  expect(init.signal).toBe(controller.signal);
});

it("escapes the follow job ID and forwards cancellation to the status request", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pending: 0 })));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  await authApi.getPeerTubeFollowImport("job/id", controller.signal);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://localhost:8080/api/v1/me/import/peertube/follows/job%2Fid");
  expect(init.signal).toBe(controller.signal);
});
